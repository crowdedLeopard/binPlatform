#!/bin/bash
# Local development setup script

set -e

echo "🚀 Setting up Hampshire Bin Collection Platform for local development"

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20 or higher is required. Current version: $(node -v)" >&2
    exit 1
fi

echo "✅ Prerequisites check passed"

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example"
    cp .env.example .env
    echo "⚠️  Please edit .env with your configuration"
else
    echo "✅ .env already exists"
fi

# Install dependencies
echo "📦 Installing npm dependencies"
npm install

# Start Docker services
echo "🐳 Starting Docker services (PostgreSQL, Redis, Azurite)"
docker-compose -f deploy/docker-compose.yml up -d postgres redis azurite

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run database migrations
echo "🗄️  Running database migrations"
npm run db:migrate || echo "⚠️  Migrations failed - you may need to run them manually"

# Seed initial data
echo "🌱 Seeding council data"
npm run db:seed || echo "⚠️  Seeding failed - you may need to run it manually"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your configuration"
echo "  2. Run 'make dev' to start the development server"
echo "  3. Run 'make test' to run tests"
echo "  4. Visit http://localhost:3000/health to check API health"
echo ""
echo "Useful commands:"
echo "  make dev          - Start development server"
echo "  make test         - Run all tests"
echo "  make docker-up    - Start all Docker services"
echo "  make docker-down  - Stop all Docker services"
echo "  make docker-logs  - View Docker logs"
echo ""
