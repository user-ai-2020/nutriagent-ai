# NutriAgent AI - GCP Infrastructure (POC)
# Terraform configuration for Cloud Run, Cloud SQL, Memorystore

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "meal_image_retention_days" {
  description = "Delete meal images older than this many days (0 = disabled)"
  type        = number
  default     = 365
}

# Meal image object storage (production)
resource "google_storage_bucket" "meal_images" {
  name                        = "${var.project_id}-meal-images"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  dynamic "lifecycle_rule" {
    for_each = var.meal_image_retention_days > 0 ? [1] : []
    content {
      condition {
        age = var.meal_image_retention_days
      }
      action {
        type = "Delete"
      }
    }
  }
}

# Cloud SQL (PostgreSQL + pgVector)
resource "google_sql_database_instance" "main" {
  name             = "nutriagent-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro" # Free tier eligible

    database_flags {
      name  = "cloudsql.enable_pgvector"
      value = "on"
    }

    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0" # Restrict in production
      }
    }
  }

  deletion_protection = false
}

resource "google_sql_database" "nutriagent" {
  name     = "nutriagent"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "nutriagent" {
  name     = "nutriagent"
  instance = google_sql_database_instance.main.name
  password = "CHANGE_ME_USE_SECRET_MANAGER"
}

# Memorystore Redis (minimal tier for POC)
resource "google_redis_instance" "cache" {
  name           = "nutriagent-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region
}

# Cloud Run services
resource "google_cloud_run_v2_service" "api_gateway" {
  name     = "nutriagent-api-gateway"
  location = var.region

  template {
    containers {
      image = "gcr.io/${var.project_id}/nutriagent-api-gateway:latest"
      ports {
        container_port = 3000
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql://nutriagent:PASSWORD@${google_sql_database_instance.main.public_ip_address}:5432/nutriagent"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
      }
      env {
        name  = "MEAL_IMAGE_STORAGE"
        value = "gcs"
      }
      env {
        name  = "GCS_MEAL_IMAGES_BUCKET"
        value = google_storage_bucket.meal_images.name
      }
    }
  }
}

# IAM - allow unauthenticated access to API (POC only)
resource "google_cloud_run_service_iam_member" "api_public" {
  service  = google_cloud_run_v2_service.api_gateway.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "database_ip" {
  value = google_sql_database_instance.main.public_ip_address
}

output "redis_host" {
  value = google_redis_instance.cache.host
}

output "api_gateway_url" {
  value = google_cloud_run_v2_service.api_gateway.uri
}

output "meal_images_bucket" {
  value = google_storage_bucket.meal_images.name
}
