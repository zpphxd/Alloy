#!/bin/bash

# Alloy Production Deployment Script
# This script handles production deployment with proper checks and rollback capabilities

set -e

echo "🚀 Starting Alloy production deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_ID="deploy_$(date +%s)"
BACKUP_DIR="backups"
LOG_FILE="deployment.log"
HEALTH_CHECK_TIMEOUT=300
ROLLBACK_TIMEOUT=30

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1" | tee -a $LOG_FILE
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1" | tee -a $LOG_FILE
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a $LOG_FILE
}

print_error() {
    echo -e "${RED}✗${NC} $1" | tee -a $LOG_FILE
}

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

# Pre-deployment checks
pre_deployment_checks() {
    print_info "Running pre-deployment checks..."
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -f "prisma/schema.prisma" ]; then
        print_error "Not in the correct project directory"
        exit 1
    fi
    
    # Check environment variables
    if [ -z "$DATABASE_URL" ]; then
        print_error "DATABASE_URL environment variable is not set"
        exit 1
    fi
    
    if [ -z "$CLERK_SECRET_KEY" ]; then
        print_error "CLERK_SECRET_KEY environment variable is not set"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    
    if [ "$NODE_MAJOR_VERSION" -lt "18" ]; then
        print_error "Node.js version $NODE_VERSION is too old. Production requires Node.js 18+"
        exit 1
    fi
    
    print_status "Pre-deployment checks passed"
}

# Database backup
backup_database() {
    print_info "Creating database backup..."
    
    mkdir -p $BACKUP_DIR
    
    BACKUP_FILE="$BACKUP_DIR/backup_${DEPLOYMENT_ID}.sql"
    
    # Extract database details from DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    
    # Create backup
    if command -v pg_dump &> /dev/null; then
        PGPASSWORD="${DATABASE_PASSWORD:-}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_FILE"
        print_status "Database backup created: $BACKUP_FILE"
    else
        print_warning "pg_dump not found. Skipping database backup."
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing production dependencies..."
    
    # Clean install
    rm -rf node_modules package-lock.json
    npm ci --only=production
    
    # Build packages
    cd packages/agent-core
    npm ci --only=production
    npm run build
    cd ../..
    
    print_status "Dependencies installed"
}

# Run database migrations
run_migrations() {
    print_info "Running database migrations..."
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate deploy
    
    print_status "Database migrations completed"
}

# Build application
build_application() {
    print_info "Building application..."
    
    # Set production environment
    export NODE_ENV=production
    
    # Build Next.js application
    npm run build
    
    print_status "Application built"
}

# Run production tests
run_production_tests() {
    print_info "Running production tests..."
    
    # Run tests with production configuration
    NODE_ENV=production timeout 120 npm test || {
        print_error "Production tests failed"
        return 1
    }
    
    print_status "Production tests passed"
}

# Health check function
health_check() {
    local url=$1
    local timeout=${2:-30}
    local interval=5
    local elapsed=0
    
    print_info "Performing health check on $url..."
    
    while [ $elapsed -lt $timeout ]; do
        if curl -sf "$url/api/health" > /dev/null 2>&1; then
            print_status "Health check passed"
            return 0
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        print_info "Health check attempt $((elapsed / interval))..."
    done
    
    print_error "Health check failed after $timeout seconds"
    return 1
}

# Deploy to production
deploy_application() {
    print_info "Deploying application..."
    
    # Stop existing application (if using PM2)
    if command -v pm2 &> /dev/null; then
        pm2 stop alloy-workspace || print_warning "Application not running"
        
        # Start application
        pm2 start ecosystem.config.js --name alloy-workspace
        
        # Save PM2 configuration
        pm2 save
        
        print_status "Application deployed with PM2"
    else
        print_warning "PM2 not found. You'll need to start the application manually."
        print_info "Run 'npm start' to start the application"
    fi
}

# Rollback function
rollback_deployment() {
    print_warning "Rolling back deployment..."
    
    # Stop current deployment
    if command -v pm2 &> /dev/null; then
        pm2 stop alloy-workspace || true
    fi
    
    # Restore database backup
    if [ -f "$BACKUP_FILE" ]; then
        print_info "Restoring database backup..."
        PGPASSWORD="${DATABASE_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_FILE"
        print_status "Database restored"
    fi
    
    # Restart previous version (if using PM2)
    if command -v pm2 &> /dev/null; then
        pm2 restart alloy-workspace
    fi
    
    print_status "Rollback completed"
    exit 1
}

# Post-deployment tasks
post_deployment_tasks() {
    print_info "Running post-deployment tasks..."
    
    # Clear any caches
    if [ -d ".next/cache" ]; then
        rm -rf .next/cache
    fi
    
    # Warm up the application
    if command -v curl &> /dev/null; then
        curl -sf http://localhost:3000 > /dev/null || print_warning "Failed to warm up application"
    fi
    
    # Send deployment notification (if webhook URL is configured)
    if [ -n "$DEPLOYMENT_WEBHOOK_URL" ]; then
        curl -X POST "$DEPLOYMENT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"deployment_id\": \"$DEPLOYMENT_ID\",
                \"status\": \"success\",
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
                \"version\": \"$(git rev-parse HEAD 2>/dev/null || echo 'unknown')\",
                \"environment\": \"production\"
            }" || print_warning "Failed to send deployment notification"
    fi
    
    print_status "Post-deployment tasks completed"
}

# Monitor deployment
monitor_deployment() {
    print_info "Monitoring deployment..."
    
    # Monitor for the first 5 minutes
    local monitor_duration=300
    local check_interval=30
    local elapsed=0
    
    while [ $elapsed -lt $monitor_duration ]; do
        if ! health_check "http://localhost:3000" 10; then
            print_error "Application became unhealthy during monitoring"
            rollback_deployment
        fi
        
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
        print_info "Monitoring... $((elapsed / 60))m elapsed"
    done
    
    print_status "Deployment monitoring completed successfully"
}

# Create PM2 ecosystem configuration
create_pm2_config() {
    if [ ! -f "ecosystem.config.js" ]; then
        print_info "Creating PM2 ecosystem configuration..."
        
        cat > ecosystem.config.js << 'EOL'
module.exports = {
  apps: [{
    name: 'alloy-workspace',
    script: './node_modules/.bin/next',
    args: 'start -p 3000',
    cwd: '.',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=4096',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    health_check_grace_period: 30000,
    max_restarts: 5,
    min_uptime: '10s',
    autorestart: true,
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git'],
    instance_var: 'INSTANCE_ID',
    combine_logs: true,
    merge_logs: true
  }]
}
EOL
        
        # Create logs directory
        mkdir -p logs
        
        print_status "PM2 configuration created"
    fi
}

# Cleanup function
cleanup() {
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        print_error "Deployment failed with exit code $exit_code"
        
        # Ask for rollback confirmation
        if [ -t 0 ]; then  # Check if stdin is a terminal
            read -p "Do you want to rollback? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                rollback_deployment
            fi
        else
            print_warning "Non-interactive mode. Skipping rollback confirmation."
        fi
    else
        print_status "Deployment completed successfully!"
        print_info "Deployment ID: $DEPLOYMENT_ID"
        print_info "Log file: $LOG_FILE"
        
        # Clean up old backups (keep last 5)
        if [ -d "$BACKUP_DIR" ]; then
            ls -t $BACKUP_DIR/backup_*.sql | tail -n +6 | xargs -r rm
        fi
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Main deployment function
main() {
    echo "🎯 Alloy Production Deployment"
    echo "=============================="
    echo "Deployment ID: $DEPLOYMENT_ID"
    echo "Timestamp: $(date)"
    echo "User: $(whoami)"
    echo "Host: $(hostname)"
    echo ""
    
    log "Starting deployment $DEPLOYMENT_ID"
    
    # Deployment steps
    pre_deployment_checks
    backup_database
    install_dependencies
    run_migrations
    build_application
    run_production_tests
    create_pm2_config
    deploy_application
    
    # Health check with timeout
    if ! health_check "http://localhost:3000" $HEALTH_CHECK_TIMEOUT; then
        print_error "Health check failed. Rolling back..."
        rollback_deployment
    fi
    
    post_deployment_tasks
    monitor_deployment
    
    log "Deployment $DEPLOYMENT_ID completed successfully"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --skip-tests    Skip production tests"
            echo "  --skip-backup   Skip database backup"
            echo "  --dry-run       Show what would be done without executing"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Handle dry run
if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN MODE - No changes will be made"
    echo "This would execute the following steps:"
    echo "1. Pre-deployment checks"
    echo "2. Database backup (if not skipped)"
    echo "3. Install dependencies"
    echo "4. Run database migrations"
    echo "5. Build application"
    echo "6. Run production tests (if not skipped)"
    echo "7. Deploy application"
    echo "8. Health checks"
    echo "9. Post-deployment tasks"
    echo "10. Monitor deployment"
    exit 0
fi

# Run main deployment
main "$@"