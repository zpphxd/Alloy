# Alloy

Professional AI coding workspace for teams - A comprehensive backend infrastructure for orchestrating AI agents in a secure, multi-tenant environment.

## 🌟 Features

- **Multi-tenant Architecture** - Secure organization-based isolation
- **AI Agent Orchestration** - Powerful task execution with dependency management
- **Role-based Access Control** - Fine-grained permissions (OWNER, ADMIN, EDITOR, VIEWER)
- **Comprehensive Observability** - Structured logging, metrics, and distributed tracing
- **Production-ready Security** - Sandboxed agent execution with resource limits
- **Real-time Webhooks** - Seamless integration with Clerk for user/org sync
- **Database-first Design** - PostgreSQL with Prisma ORM and migrations
- **Type-safe APIs** - tRPC with full TypeScript support
- **Comprehensive Testing** - Unit, integration, and end-to-end tests

## 🏗 Architecture

### Monorepo Structure

```
alloy/
├── apps/
│   └── workspace/           # Main Next.js application
│       ├── src/
│       │   ├── lib/        # Core utilities and services
│       │   ├── pages/      # Next.js pages and API routes
│       │   └── server/     # tRPC API layer
│       ├── prisma/         # Database schema and migrations
│       └── scripts/        # Deployment and setup scripts
├── packages/
│   ├── agent-core/         # Agent orchestration engine
│   ├── agent-tools/        # Agent utility tools
│   └── agents/             # Individual agent implementations
└── templates/              # Project templates
```

### Key Components

1. **Database Layer** (PostgreSQL + Prisma)
   - Multi-tenant data model with organizations
   - Audit trail for all actions
   - Encrypted secrets management
   - Agent execution tracking

2. **Authentication & Authorization** (Clerk)
   - User and organization management
   - Webhook-based sync for real-time updates
   - Role-based access control
   - JWT token validation

3. **API Layer** (tRPC)
   - Type-safe client-server communication
   - Request/response validation with Zod
   - Automatic OpenAPI documentation
   - Rate limiting and CORS protection

4. **Agent Orchestration** (@alloy/agent-core)
   - Secure sandbox execution
   - Resource limits and monitoring
   - Dependency management and workflow support
   - Retry logic and error handling

5. **Observability Stack**
   - Structured logging with correlation IDs
   - Metrics collection and aggregation
   - Distributed tracing spans
   - Health checks and monitoring

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Docker (optional, for local development)

### Development Setup

1. **Clone and setup the repository:**
   ```bash
   git clone <repository-url>
   cd alloy/apps/workspace
   chmod +x scripts/setup-dev.sh
   ./scripts/setup-dev.sh
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual API keys and database credentials
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Web application: http://localhost:3000
   - Database Studio: `npm run db:studio`
   - Health check: http://localhost:3000/api/health

### Manual Setup (Alternative)

1. **Install dependencies:**
   ```bash
   npm install
   cd packages/agent-core && npm install && cd ../..
   ```

2. **Setup database:**
   ```bash
   # Using Docker
   docker-compose -f docker-compose.dev.yml up -d
   
   # Or use your own PostgreSQL instance
   createdb alloy_dev
   ```

3. **Run migrations and seed:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Build packages:**
   ```bash
   cd packages/agent-core && npm run build && cd ../..
   ```

5. **Run tests:**
   ```bash
   npm test
   ```

## 📚 API Documentation

### Core Entities

- **Organizations** - Multi-tenant root entities
- **Users** - Individual users with Clerk integration
- **Projects** - Containers for environments and resources
- **Environments** - Development/staging/production contexts
- **Secrets** - Encrypted environment variables
- **Agents** - AI-powered automation tasks

### tRPC Routes

```typescript
// Organizations
trpc.organizations.list.query()
trpc.organizations.create.mutate({ name, slug })
trpc.organizations.invite.mutate({ email, role })

// Projects  
trpc.projects.list.query({ organizationId })
trpc.projects.create.mutate({ name, description })

// Environments
trpc.environments.list.query({ projectId })
trpc.environments.create.mutate({ name, type, projectId })

// Agent Executions
trpc.agents.execute.mutate({ 
  agentType: 'CODE_ANALYZER',
  input: { repository: 'https://github.com/...' },
  environmentId 
})
trpc.agents.getStatus.query({ executionId })
trpc.agents.cancel.mutate({ executionId })
```

### Webhook Endpoints

- `POST /api/webhooks/clerk` - Clerk user/organization sync
- `GET /api/health` - Application health status

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:password@host:port/dbname"
DATABASE_DIRECT_URL="postgresql://user:password@host:port/dbname"

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# Application
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"
NODE_ENV="development"

# Agent Configuration
AGENT_MAX_MEMORY_MB=512
AGENT_MAX_CPU_PERCENT=50
AGENT_MAX_EXECUTION_TIME_MS=300000
AGENT_MAX_DISK_MB=100

# Security
ALLOWED_ORIGINS="http://localhost:3000"
```

### Optional Configuration

```bash
# Redis (for caching and queuing)
REDIS_URL="redis://localhost:6379"

# Monitoring
DEPLOYMENT_WEBHOOK_URL="https://hooks.slack.com/..."

# Development
DEBUG="alloy:*"
LOG_LEVEL="debug"
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm test -- auth.test.ts

# Run with coverage
npm run test:coverage
```

### Test Types

1. **Unit Tests** - Individual functions and components
2. **Integration Tests** - API endpoints and database operations
3. **E2E Tests** - Full user workflows
4. **Security Tests** - Authentication and authorization

### Test Database

Tests use a separate test database to avoid conflicts:

```bash
# Setup test database
DATABASE_URL="postgresql://user:password@host:port/alloy_test" npm run db:migrate
```

## 🔒 Security

### Authentication & Authorization

- **Clerk Integration** - Secure user management with webhooks
- **Role-based Access** - OWNER > ADMIN > EDITOR > VIEWER
- **Multi-tenant Isolation** - Data segregation by organization
- **API Rate Limiting** - Prevent abuse with request limits

### Agent Security

- **Sandbox Execution** - Isolated environment for agent runs
- **Resource Limits** - Memory, CPU, and execution time constraints
- **Network Restrictions** - Whitelist/blacklist for external requests
- **Code Validation** - Input sanitization and output filtering

### Data Protection

- **Encrypted Secrets** - AES-256 encryption for sensitive data
- **Audit Logging** - Complete trail of all user actions
- **Database Security** - Parameterized queries and access controls
- **HTTPS Enforcement** - TLS for all external communications

## 📊 Monitoring & Observability

### Health Checks

Access health information at `/api/health`:

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "pass", "responseTime": 15 },
    "memory": { "status": "pass", "usagePercent": "45.2" },
    "dependencies": {
      "clerk": { "status": "pass" }
    }
  }
}
```

### Logging

Structured JSON logs with correlation IDs:

```javascript
const logger = Logger.getInstance({ correlationId: 'req_123' })
logger.info('User action', { userId, action: 'CREATE_PROJECT' })
```

### Metrics

Key metrics tracked:
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Agent execution success rates
- Database query performance
- Memory and CPU utilization

### Tracing

Distributed tracing with OpenTelemetry-compatible spans:

```javascript
const span = tracer.startSpan('database.query')
// ... operation
tracer.finishSpan(span.spanId)
```

## 🚀 Deployment

### Production Deployment

1. **Automated deployment:**
   ```bash
   chmod +x scripts/deploy-production.sh
   ./scripts/deploy-production.sh
   ```

2. **Manual deployment steps:**
   ```bash
   # Build application
   NODE_ENV=production npm run build
   
   # Run migrations
   npm run db:migrate:deploy
   
   # Start with PM2
   pm2 start ecosystem.config.js
   ```

### Environment-specific Configurations

- **Development** - Local database, debug logging, hot reload
- **Staging** - Production-like setup with test data
- **Production** - Optimized builds, monitoring, backups

### Infrastructure Requirements

**Minimum:**
- 2 vCPUs, 4GB RAM
- PostgreSQL 15+
- 20GB SSD storage
- Load balancer (for multiple instances)

**Recommended:**
- 4 vCPUs, 8GB RAM  
- PostgreSQL with read replicas
- Redis for caching
- CDN for static assets
- Monitoring stack (DataDog, New Relic, etc.)

## 🔧 Development

### Adding New Agents

1. **Create agent implementation:**
   ```typescript
   // packages/agents/src/my-agent.ts
   export const myAgentHandler = async (input: any, context: ExecutionContext) => {
     // Agent logic here
     return { success: true, data: result }
   }
   ```

2. **Register agent:**
   ```typescript
   // apps/workspace/src/lib/agent-orchestrator.ts
   this.registry.register({
     type: 'MY_AGENT',
     name: 'My Custom Agent',
     handler: myAgentHandler,
     inputSchema: z.object({ /* schema */ }),
     outputSchema: z.object({ /* schema */ })
   })
   ```

3. **Add to API:**
   ```typescript
   // Update AgentType enum and tRPC routes
   ```

### Database Migrations

```bash
# Create new migration
npx prisma migrate dev --name add_new_feature

# Reset database (dev only)
npm run db:reset

# Deploy migrations
npm run db:migrate:deploy
```

### Adding New API Routes

1. **Create tRPC router:**
   ```typescript
   // apps/workspace/src/server/api/routers/my-feature.ts
   export const myFeatureRouter = createTRPCRouter({
     list: protectedProcedure.query(async ({ ctx }) => {
       // Implementation
     })
   })
   ```

2. **Add to root router:**
   ```typescript
   // apps/workspace/src/server/api/root.ts
   export const appRouter = createTRPCRouter({
     // ... existing routers
     myFeature: myFeatureRouter
   })
   ```

## 📋 Scripts Reference

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start          # Start production server

# Database
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run development migrations  
npm run db:migrate:deploy # Deploy production migrations
npm run db:seed        # Seed database with demo data
npm run db:studio      # Open Prisma Studio
npm run db:reset       # Reset database (dev only)

# Testing
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:e2e       # Run end-to-end tests

# Utilities
npm run lint           # Lint codebase
npm run typecheck      # TypeScript type checking
npm run format         # Format code with Prettier
npm run clean          # Clean build artifacts
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create feature branch:** `git checkout -b feature/amazing-feature`
3. **Run tests:** `npm test`
4. **Commit changes:** `git commit -m 'Add amazing feature'`
5. **Push to branch:** `git push origin feature/amazing-feature`
6. **Open Pull Request**

### Code Style

- **TypeScript** with strict mode enabled
- **Prettier** for code formatting
- **ESLint** for code quality
- **Conventional Commits** for commit messages

### Pull Request Process

1. Update documentation for new features
2. Add tests for new functionality  
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review from maintainers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation:** [https://alloy-docs.dev](https://alloy-docs.dev)
- **Issues:** [GitHub Issues](https://github.com/alloy/alloy/issues)
- **Discussions:** [GitHub Discussions](https://github.com/alloy/alloy/discussions)
- **Discord:** [Join our community](https://discord.gg/alloy)

## 🗺 Roadmap

### v0.1.0 (Current)
- ✅ Multi-tenant architecture
- ✅ Basic agent orchestration
- ✅ User authentication with Clerk
- ✅ Database schema and migrations
- ✅ tRPC API layer
- ✅ Comprehensive testing

### v0.2.0 (Next)
- [ ] Real-time WebSocket updates
- [ ] Advanced agent workflow builder
- [ ] Plugin system for custom agents
- [ ] Advanced monitoring dashboard
- [ ] GitOps integration

### v0.3.0 (Future)
- [ ] Multi-cloud deployment support
- [ ] GraphQL API alternative
- [ ] Mobile application
- [ ] Advanced analytics and reporting
- [ ] Enterprise SSO integration

---

**Built with ❤️ by the Alloy team**