# NutriAgent AI — GCP infrastructure
#
# Layout:
#   Artifact Registry  — container images (CI pushes here)
#   Cloud SQL Postgres — pgvector; private IP only, reached via VPC connector
#   Memorystore Redis  — audit-log cache
#   Cloud Storage      — meal images (private; served via signed URLs)
#   Secret Manager     — DB password, JWT secret, OpenRouter/FDC keys
#   Cloud Run          — 7 backend services (internal ingress) + 2 portals (public)
#
# Cost note: Cloud Run / Cloud Storage / Secret Manager / Cloud Build have Always
# Free monthly allowances. Cloud SQL and Memorystore DO NOT — despite what an
# earlier revision of this file claimed, `db-f1-micro` is not "free tier eligible".
# Both bill from day one; the $300 new-customer credit is what covers them.
#
# First run:
#   terraform init
#   terraform apply -var="project_id=nuitri-agent"
# Then push images and run migrations — see infra/README.md.

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "me-west1" # Tel Aviv — lowest latency for IL users
}

variable "image_tag" {
  description = "Container image tag to deploy (git SHA in CI, or 'latest')"
  type        = string
  default     = "latest"
}

variable "meal_image_retention_days" {
  description = "Delete meal images older than this many days (0 = disabled)"
  type        = number
  default     = 365
}

variable "db_tier" {
  description = <<-EOT
    Cloud SQL machine type. db-f1-micro (~0.6GB RAM) is too small for pgvector
    HNSW indexes over 1024-dim embeddings plus the LangGraph checkpointer —
    db-g1-small is the practical floor.
  EOT
  type        = string
  default     = "db-g1-small"
}

variable "cors_origins" {
  description = <<-EOT
    Comma-separated origins allowed to call the API gateway directly. Usually empty:
    the portals proxy through their own /api/* routes (same-origin). Set this for a
    mobile build or any client that hits the gateway cross-origin.
  EOT
  type        = string
  default     = ""
}

variable "openrouter_api_key" {
  description = "OpenRouter API key (vision, chat, reranker). Empty = mock mode."
  type        = string
  sensitive   = true
  default     = ""
}

variable "fdc_api_key" {
  description = "USDA FoodData Central API key (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  # Backend services: internal ingress only — never publicly invokable.
  backend_services = {
    orchestrator   = { port = 3001, cpu = "1",   memory = "1Gi",   db = true }
    vision-agent   = { port = 3002, cpu = "1",   memory = "512Mi", db = true }
    nutrition-agent= { port = 3003, cpu = "0.5", memory = "512Mi", db = true }
    rag-agent      = { port = 3004, cpu = "1",   memory = "1Gi",   db = true }
    text2sql-agent = { port = 3005, cpu = "0.5", memory = "512Mi", db = true }
    graphdb-agent  = { port = 3006, cpu = "0.5", memory = "256Mi", db = false }
  }

  registry = "${var.region}-docker.pkg.dev/${var.project_id}/nutriagent"
}

# ---------------------------------------------------------------------------
# APIs
# ---------------------------------------------------------------------------

resource "google_project_service" "required" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Artifact Registry — CI pushes images here
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "nutriagent" {
  location      = var.region
  repository_id = "nutriagent"
  format        = "DOCKER"
  description   = "NutriAgent service images"
  depends_on    = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Networking — private Cloud SQL + Redis, reached from Cloud Run via connector
# ---------------------------------------------------------------------------

resource "google_compute_network" "vpc" {
  name                    = "nutriagent-vpc"
  auto_create_subnetworks = true
  depends_on              = [google_project_service.required]
}

resource "google_compute_global_address" "private_ip" {
  name          = "nutriagent-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

resource "google_vpc_access_connector" "connector" {
  name          = "nutriagent-conn"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"
  depends_on    = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

resource "random_password" "db" {
  length  = 32
  special = false # avoids URL-encoding issues inside DATABASE_URL
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "nutriagent-db-password"
  replication { auto {} }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "nutriagent-jwt-secret"
  replication { auto {} }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt.result
}

resource "google_secret_manager_secret" "openrouter" {
  secret_id = "nutriagent-openrouter-key"
  replication { auto {} }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "openrouter" {
  secret      = google_secret_manager_secret.openrouter.id
  secret_data = var.openrouter_api_key
}

resource "google_secret_manager_secret" "fdc" {
  secret_id = "nutriagent-fdc-key"
  replication { auto {} }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "fdc" {
  secret      = google_secret_manager_secret.fdc.id
  secret_data = var.fdc_api_key
}

# ---------------------------------------------------------------------------
# Service account for Cloud Run
# ---------------------------------------------------------------------------

resource "google_service_account" "run" {
  account_id   = "nutriagent-run"
  display_name = "NutriAgent Cloud Run services"
}

resource "google_project_iam_member" "run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each = {
    db  = google_secret_manager_secret.db_password.id
    jwt = google_secret_manager_secret.jwt_secret.id
    or  = google_secret_manager_secret.openrouter.id
    fdc = google_secret_manager_secret.fdc.id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# Object admin on the bucket + token creator so the gateway can mint signed URLs.
resource "google_storage_bucket_iam_member" "meal_images" {
  bucket = google_storage_bucket.meal_images.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run.email}"
}

resource "google_service_account_iam_member" "token_creator" {
  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.run.email}"
}

# ---------------------------------------------------------------------------
# Storage — meal images (private; signed URLs only)
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "meal_images" {
  name                        = "${var.project_id}-meal-images"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
  public_access_prevention    = "enforced"

  dynamic "lifecycle_rule" {
    for_each = var.meal_image_retention_days > 0 ? [1] : []
    content {
      condition { age = var.meal_image_retention_days }
      action { type = "Delete" }
    }
  }
}

# ---------------------------------------------------------------------------
# Cloud SQL (PostgreSQL + pgvector) — private IP only
# ---------------------------------------------------------------------------

resource "google_sql_database_instance" "main" {
  name             = "nutriagent-db"
  database_version = "POSTGRES_16" # matches the local pgvector/pgvector:pg16 image
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    database_flags {
      name  = "cloudsql.enable_pgvector"
      value = "on"
    }

    ip_configuration {
      # No public IP: reachable only through the VPC connector. The previous
      # revision allowed 0.0.0.0/0, which exposed the database to the internet.
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }
  }

  deletion_protection = true
  depends_on          = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "nutriagent" {
  name     = "nutriagent"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "nutriagent" {
  name     = "nutriagent"
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# ---------------------------------------------------------------------------
# Memorystore Redis — audit-log cache
# ---------------------------------------------------------------------------

resource "google_redis_instance" "cache" {
  name               = "nutriagent-redis"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  depends_on         = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Cloud Run — backend services (internal ingress)
# ---------------------------------------------------------------------------

locals {
  db_url = "postgresql://nutriagent:${random_password.db.result}@${google_sql_database_instance.main.private_ip_address}:5432/nutriagent?connection_limit=3"

  redis_url = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
}

resource "google_cloud_run_v2_service" "backend" {
  for_each = local.backend_services

  name     = "nutriagent-${each.key}"
  location = var.region
  # Only reachable from inside the VPC — the gateway calls these, users never do.
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = 0 # scale to zero between demos
      max_instance_count = 3
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.registry}/nutriagent-${each.key}:${var.image_tag}"

      ports { container_port = each.value.port }

      resources {
        limits = {
          cpu    = each.value.cpu
          memory = each.value.memory
        }
      }

      env {
        name  = "PORT"
        value = tostring(each.value.port)
      }

      dynamic "env" {
        for_each = each.value.db ? [1] : []
        content {
          name  = "DATABASE_URL"
          value = local.db_url
        }
      }

      env {
        name = "OPENROUTER_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.openrouter.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "FDC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.fdc.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Cloud Run Job — schema migrations / seed / USDA import
#
# Runs inside the VPC so it can reach the private-IP database, which CI cannot.
# Trigger with:
#   gcloud run jobs execute nutriagent-migrate --region me-west1 --wait
#   gcloud run jobs execute nutriagent-migrate --args=seed --region me-west1 --wait
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_job" "migrate" {
  name     = "nutriagent-migrate"
  location = var.region

  template {
    template {
      service_account = google_service_account.run.email
      # Migrations must not be retried blindly — a partial failure needs eyes on it.
      max_retries = 0
      timeout     = "900s"

      vpc_access {
        connector = google_vpc_access_connector.connector.id
        egress    = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image = "${local.registry}/nutriagent-migrate:${var.image_tag}"

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        env {
          name  = "DATABASE_URL"
          value = local.db_url
        }
      }
    }
  }

  depends_on = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Cloud Run — API gateway (public; fans out to the internal agents)
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api_gateway" {
  name     = "nutriagent-api-gateway"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.registry}/nutriagent-api-gateway:${var.image_tag}"
      ports { container_port = 3000 }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "API_PORT"
        value = "3000"
      }
      env {
        name  = "DATABASE_URL"
        value = local.db_url
      }
      env {
        name  = "REDIS_URL"
        value = local.redis_url
      }
      env {
        name  = "MEAL_IMAGE_STORAGE"
        value = "gcs"
      }
      env {
        name  = "GCS_MEAL_IMAGES_BUCKET"
        value = google_storage_bucket.meal_images.name
      }

      # Service discovery: every agent's generated Cloud Run URL.
      env {
        name  = "ORCHESTRATOR_URL"
        value = google_cloud_run_v2_service.backend["orchestrator"].uri
      }
      env {
        name  = "VISION_AGENT_URL"
        value = google_cloud_run_v2_service.backend["vision-agent"].uri
      }
      env {
        name  = "NUTRITION_AGENT_URL"
        value = google_cloud_run_v2_service.backend["nutrition-agent"].uri
      }
      env {
        name  = "RAG_AGENT_URL"
        value = google_cloud_run_v2_service.backend["rag-agent"].uri
      }
      env {
        name  = "TEXT2SQL_AGENT_URL"
        value = google_cloud_run_v2_service.backend["text2sql-agent"].uri
      }
      env {
        name  = "GRAPHDB_AGENT_URL"
        value = google_cloud_run_v2_service.backend["graphdb-agent"].uri
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "OPENROUTER_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.openrouter.secret_id
            version = "latest"
          }
        }
      }

      # Deliberately NOT derived from portal.uri: the portals already depend on
      # api_gateway.uri for API_PROXY_TARGET, so reading their URLs back here
      # creates a Terraform dependency cycle. It also isn't needed — the browser
      # calls the portal's own /api/* routes and Next.js middleware proxies to the
      # gateway server-side, so requests are same-origin. Set var.cors_origins only
      # if something calls the gateway directly from another origin (e.g. mobile).
      env {
        name  = "CORS_ORIGIN"
        value = var.cors_origins
      }
    }
  }

  depends_on = [google_project_service.required]
}

# The orchestrator also needs to reach the agents directly.
resource "google_cloud_run_v2_service_iam_member" "backend_invoker" {
  for_each = local.backend_services
  name     = google_cloud_run_v2_service.backend[each.key].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.run.email}"
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api_gateway.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# Cloud Run — Next.js portals (public)
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "portal" {
  for_each = {
    user-portal  = 3008
    admin-portal = 3007
  }

  name     = "nutriagent-${each.key}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = "${local.registry}/nutriagent-${each.key}:${var.image_tag}"
      ports { container_port = each.value }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "PORT"
        value = tostring(each.value)
      }
      # Server-side proxy target for the portal's /api routes.
      env {
        name  = "API_PROXY_TARGET"
        value = google_cloud_run_v2_service.api_gateway.uri
      }
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "portal_public" {
  for_each = google_cloud_run_v2_service.portal
  name     = each.value.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "api_gateway_url" {
  value = google_cloud_run_v2_service.api_gateway.uri
}

output "user_portal_url" {
  value = google_cloud_run_v2_service.portal["user-portal"].uri
}

output "admin_portal_url" {
  value = google_cloud_run_v2_service.portal["admin-portal"].uri
}

output "database_private_ip" {
  value = google_sql_database_instance.main.private_ip_address
}

output "artifact_registry" {
  value = local.registry
}

output "meal_images_bucket" {
  value = google_storage_bucket.meal_images.name
}

# Read with: terraform output -raw database_url
output "database_url" {
  value     = local.db_url
  sensitive = true
}
