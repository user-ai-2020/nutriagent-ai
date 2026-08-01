@echo off
set ROOT=%~dp0..
echo Starting NutriAgent AI from %ROOT%

start "API Gateway" cmd /k "cd /d %ROOT%\services\api-gateway && npx tsx src/index.ts"
timeout /t 2 /nobreak > nul
start "Orchestrator" cmd /k "cd /d %ROOT%\services\orchestrator && npx tsx src/index.ts"
timeout /t 1 /nobreak > nul
start "Vision Agent" cmd /k "cd /d %ROOT%\services\vision-agent && npx tsx src/index.ts"
start "Nutrition Agent" cmd /k "cd /d %ROOT%\services\nutrition-agent && npx tsx src/index.ts"
start "RAG Agent" cmd /k "cd /d %ROOT%\services\rag-agent && npx tsx src/index.ts"
start "Text2SQL Agent" cmd /k "cd /d %ROOT%\services\text2sql-agent && npx tsx src/index.ts"
start "GraphDB Agent" cmd /k "cd /d %ROOT%\services\graphdb-agent && npx tsx src/index.ts"
timeout /t 2 /nobreak > nul
start "Admin Portal" cmd /k "cd /d %ROOT%\apps\admin-portal && set NEXT_PUBLIC_API_URL=http://localhost:3000 && npx next dev -p 3007"

echo All services starting...
echo API Gateway: http://localhost:3000
echo Admin Portal: http://localhost:3007
