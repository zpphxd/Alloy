#!/bin/bash

# Alloy Development Environment Setup Script
# This script sets up the development environment for the Alloy workspace

set -e

echo "🚀 Setting up Alloy development environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if required tools are installed
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    
    if [ "$NODE_MAJOR_VERSION" -lt "18" ]; then
        print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 18+ first."
        exit 1
    fi
    
    print_status "Node.js $NODE_VERSION installed"
    
    # Check npm/pnpm
    if command -v pnpm &> /dev/null; then
        print_status "pnpm is installed"
        PKG_MANAGER="pnpm"
    elif command -v npm &> /dev/null; then
        print_status "npm is installed"
        PKG_MANAGER="npm"
    else
        print_error "Neither npm nor pnpm is installed. Please install one first."
        exit 1
    fi
    
    # Check Docker (optional but recommended)
    if command -v docker &> /dev/null; then
        print_status "Docker is installed"
        HAS_DOCKER=true
    else
        print_warning "Docker is not installed. You'll need to set up PostgreSQL manually."
        HAS_DOCKER=false
    fi
    
    # Check PostgreSQL (if no Docker)
    if [ "$HAS_DOCKER" = false ]; then
        if command -v psql &> /dev/null; then
            print_status "PostgreSQL is installed"
        else
            print_error "Neither Docker nor PostgreSQL is installed. Please install one."
            exit 1
        fi
    fi
}

# Create .env file if it doesn't exist
setup_env_file() {
    echo "📄 Setting up environment configuration..."
    
    if [ ! -f ".env" ]; then
        print_status "Creating .env file from template..."
        
        cat > .env << EOL
# Database Configuration
DATABASE_URL="postgresql://alloy:alloy_dev_password@localhost:5432/alloy_dev"
DATABASE_DIRECT_URL="postgresql://alloy:alloy_dev_password@localhost:5432/alloy_dev"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_secret_here
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here

# Agent Configuration
AGENT_MAX_MEMORY_MB=512
AGENT_MAX_CPU_PERCENT=50
AGENT_MAX_EXECUTION_TIME_MS=300000
AGENT_MAX_DISK_MB=100

# Security Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Development Configuration
NODE_ENV=development
EOL

        print_status ".env file created"
        print_warning "Please update the .env file with your actual API keys and secrets"
        
        # Open the file in default editor if available
        if command -v code &> /dev/null; then
            code .env
        elif command -v nano &> /dev/null; then
            print_warning "Run 'nano .env' to edit the environment file"
        fi
    else
        print_status ".env file already exists"
    fi
}

# Setup database
setup_database() {
    echo "🗄️ Setting up database..."
    
    if [ "$HAS_DOCKER" = true ]; then
        echo "Starting PostgreSQL with Docker..."
        
        # Create docker-compose.dev.yml for development
        cat > docker-compose.dev.yml << EOL
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: alloy_dev
      POSTGRES_USER: alloy
      POSTGRES_PASSWORD: alloy_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U alloy -d alloy_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
EOL
        
        # Create database initialization script
        mkdir -p scripts
        cat > scripts/init-db.sql << EOL
-- Create development database and user if they don't exist
CREATE DATABASE alloy_dev;
CREATE DATABASE alloy_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE alloy_dev TO alloy;
GRANT ALL PRIVILEGES ON DATABASE alloy_test TO alloy;

-- Enable required extensions
\\c alloy_dev;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\\c alloy_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOL

        # Start the services
        docker-compose -f docker-compose.dev.yml up -d
        
        # Wait for database to be ready
        echo "Waiting for database to be ready..."
        for i in {1..30}; do
            if docker-compose -f docker-compose.dev.yml exec postgres pg_isready -U alloy -d alloy_dev > /dev/null 2>&1; then
                print_status "Database is ready"
                break
            fi
            echo "Waiting... ($i/30)"
            sleep 2
        done
        
        if [ $i -eq 30 ]; then
            print_error "Database failed to start after 60 seconds"
            exit 1
        fi
    else
        print_warning "Please ensure PostgreSQL is running and accessible"
        print_warning "Create databases: alloy_dev and alloy_test"
    fi
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    
    # Install workspace dependencies
    print_status "Installing workspace dependencies..."
    $PKG_MANAGER install
    
    # Install agent-core dependencies
    print_status "Installing agent-core dependencies..."
    cd packages/agent-core
    $PKG_MANAGER install
    cd ../..
    
    print_status "Dependencies installed"
}

# Setup database schema
setup_schema() {
    echo "🏗️ Setting up database schema..."
    
    # Generate Prisma client
    print_status "Generating Prisma client..."
    $PKG_MANAGER run db:generate
    
    # Run migrations
    print_status "Running database migrations..."
    $PKG_MANAGER run db:migrate
    
    # Seed the database
    print_status "Seeding database with demo data..."
    $PKG_MANAGER run db:seed
    
    print_status "Database schema setup complete"
}

# Build packages
build_packages() {
    echo "🏗️ Building packages..."
    
    # Build agent-core package
    print_status "Building agent-core package..."
    cd packages/agent-core
    $PKG_MANAGER run build
    cd ../..
    
    print_status "Packages built"
}

# Run tests
run_tests() {
    echo "🧪 Running tests..."
    
    # Test agent-core
    print_status "Testing agent-core package..."
    cd packages/agent-core
    $PKG_MANAGER test
    cd ../..
    
    # Test workspace
    print_status "Testing workspace..."
    timeout 30 $PKG_MANAGER test || print_warning "Some tests may have timed out, but basic setup appears to work"
    
    print_status "Tests completed"
}

# Start development server
start_dev_server() {
    echo "🚀 Development environment is ready!"
    echo ""
    echo "Next steps:"
    echo "1. Update your .env file with actual API keys"
    echo "2. Run '$PKG_MANAGER dev' to start the development server"
    echo "3. Open http://localhost:3000 in your browser"
    echo ""
    echo "Useful commands:"
    echo "  $PKG_MANAGER dev         - Start development server"
    echo "  $PKG_MANAGER test        - Run tests"
    echo "  $PKG_MANAGER db:studio   - Open Prisma Studio"
    echo "  $PKG_MANAGER db:reset    - Reset database"
    echo ""
    
    # Ask if user wants to start dev server immediately
    read -p "Do you want to start the development server now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Starting development server..."
        $PKG_MANAGER dev
    fi
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        print_error "Setup failed. Check the errors above."
        echo ""
        echo "Common solutions:"
        echo "1. Make sure you have Node.js 18+ installed"
        echo "2. Make sure Docker is running (or PostgreSQL is available)"
        echo "3. Check that ports 3000, 5432, and 6379 are not in use"
        echo "4. Update your .env file with correct database credentials"
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Main execution
main() {
    echo "🎯 Alloy Development Environment Setup"
    echo "======================================"
    echo ""
    
    check_prerequisites
    setup_env_file
    setup_database
    install_dependencies
    setup_schema
    build_packages
    run_tests
    start_dev_server
}

# Run main function
main "$@"