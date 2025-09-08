import { PrismaClient, Role, EnvironmentType, ChangeRequestStatus } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create demo organization
  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: {
      clerkId: 'org_demo123',
      name: 'Demo Organization',
      slug: 'demo-org',
      logoUrl: 'https://example.com/logo.png',
    },
  })
  console.log('✅ Created demo organization')

  // Create demo users
  const demoOwner = await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {},
    create: {
      clerkId: 'user_owner123',
      email: 'owner@demo.com',
      firstName: 'Jane',
      lastName: 'Owner',
      avatarUrl: 'https://example.com/jane.jpg',
    },
  })

  const demoAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      clerkId: 'user_admin123',
      email: 'admin@demo.com',
      firstName: 'John',
      lastName: 'Admin',
      avatarUrl: 'https://example.com/john.jpg',
    },
  })

  const demoEditor = await prisma.user.upsert({
    where: { email: 'editor@demo.com' },
    update: {},
    create: {
      clerkId: 'user_editor123',
      email: 'editor@demo.com',
      firstName: 'Alice',
      lastName: 'Editor',
      avatarUrl: 'https://example.com/alice.jpg',
    },
  })

  const demoViewer = await prisma.user.upsert({
    where: { email: 'viewer@demo.com' },
    update: {},
    create: {
      clerkId: 'user_viewer123',
      email: 'viewer@demo.com',
      firstName: 'Bob',
      lastName: 'Viewer',
      avatarUrl: 'https://example.com/bob.jpg',
    },
  })
  console.log('✅ Created demo users')

  // Create user-organization relationships
  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: demoOwner.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: demoOwner.id,
      organizationId: demoOrg.id,
      role: Role.OWNER,
    },
  })

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: demoAdmin.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: demoAdmin.id,
      organizationId: demoOrg.id,
      role: Role.ADMIN,
    },
  })

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: demoEditor.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: demoEditor.id,
      organizationId: demoOrg.id,
      role: Role.EDITOR,
    },
  })

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: demoViewer.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: demoViewer.id,
      organizationId: demoOrg.id,
      role: Role.VIEWER,
    },
  })
  console.log('✅ Created user-organization relationships')

  // Create demo projects
  const webAppProject = await prisma.project.upsert({
    where: { id: 'web-app-project-demo' },
    update: {},
    create: {
      id: 'web-app-project-demo',
      name: 'Web Application',
      description: 'Main web application for our SaaS platform',
      organizationId: demoOrg.id,
      createdById: demoOwner.id,
    },
  })

  const apiProject = await prisma.project.upsert({
    where: { id: 'api-project-demo' },
    update: {},
    create: {
      id: 'api-project-demo',
      name: 'API Backend',
      description: 'REST API backend service',
      organizationId: demoOrg.id,
      createdById: demoAdmin.id,
    },
  })

  const mobileProject = await prisma.project.upsert({
    where: { id: 'mobile-project-demo' },
    update: {},
    create: {
      id: 'mobile-project-demo',
      name: 'Mobile App',
      description: 'React Native mobile application',
      organizationId: demoOrg.id,
      createdById: demoEditor.id,
    },
  })
  console.log('✅ Created demo projects')

  // Create environments for each project
  const environments = [
    // Web App environments
    {
      name: 'development',
      type: EnvironmentType.DEVELOPMENT,
      projectId: webAppProject.id,
    },
    {
      name: 'staging',
      type: EnvironmentType.STAGING,
      projectId: webAppProject.id,
    },
    {
      name: 'production',
      type: EnvironmentType.PRODUCTION,
      projectId: webAppProject.id,
    },
    // API environments
    {
      name: 'development',
      type: EnvironmentType.DEVELOPMENT,
      projectId: apiProject.id,
    },
    {
      name: 'staging',
      type: EnvironmentType.STAGING,
      projectId: apiProject.id,
    },
    {
      name: 'production',
      type: EnvironmentType.PRODUCTION,
      projectId: apiProject.id,
    },
    // Mobile App environments
    {
      name: 'development',
      type: EnvironmentType.DEVELOPMENT,
      projectId: mobileProject.id,
    },
    {
      name: 'staging',
      type: EnvironmentType.STAGING,
      projectId: mobileProject.id,
    },
  ]

  const createdEnvironments = []
  for (const env of environments) {
    const environment = await prisma.environment.upsert({
      where: {
        projectId_name: {
          projectId: env.projectId,
          name: env.name,
        },
      },
      update: {},
      create: env,
    })
    createdEnvironments.push(environment)
  }
  console.log('✅ Created demo environments')

  // Create demo secrets
  const secrets = [
    {
      key: 'DATABASE_URL',
      encryptedValue: 'encrypted_database_url_value',
      environmentId: createdEnvironments.find(e => 
        e.projectId === webAppProject.id && e.name === 'production'
      )?.id!,
      createdById: demoOwner.id,
    },
    {
      key: 'API_SECRET_KEY',
      encryptedValue: 'encrypted_api_secret_value',
      environmentId: createdEnvironments.find(e => 
        e.projectId === apiProject.id && e.name === 'production'
      )?.id!,
      createdById: demoAdmin.id,
    },
    {
      key: 'STRIPE_SECRET_KEY',
      encryptedValue: 'encrypted_stripe_secret_value',
      environmentId: createdEnvironments.find(e => 
        e.projectId === webAppProject.id && e.name === 'production'
      )?.id!,
      createdById: demoOwner.id,
    },
  ]

  for (const secret of secrets) {
    await prisma.secret.upsert({
      where: {
        environmentId_key: {
          environmentId: secret.environmentId,
          key: secret.key,
        },
      },
      update: {},
      create: secret,
    })
  }
  console.log('✅ Created demo secrets')

  // Create demo change requests
  const prodEnv = createdEnvironments.find(e => 
    e.projectId === webAppProject.id && e.name === 'production'
  )!

  const stagingEnv = createdEnvironments.find(e => 
    e.projectId === webAppProject.id && e.name === 'staging'
  )!

  await prisma.changeRequest.upsert({
    where: { id: 'change-request-1' },
    update: {},
    create: {
      id: 'change-request-1',
      title: 'Deploy user authentication feature',
      description: 'Deploy the new OAuth2 authentication system to production',
      status: ChangeRequestStatus.PENDING,
      environmentId: prodEnv.id,
      createdById: demoEditor.id,
    },
  })

  await prisma.changeRequest.upsert({
    where: { id: 'change-request-2' },
    update: {},
    create: {
      id: 'change-request-2',
      title: 'Update API rate limiting',
      description: 'Increase rate limits for premium users',
      status: ChangeRequestStatus.APPROVED,
      environmentId: stagingEnv.id,
      createdById: demoAdmin.id,
      deployedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    },
  })
  console.log('✅ Created demo change requests')

  // Create audit events
  const auditEvents = [
    {
      action: 'CREATE_PROJECT',
      entityType: 'PROJECT',
      entityId: webAppProject.id,
      metadata: { projectName: webAppProject.name },
      userId: demoOwner.id,
      organizationId: demoOrg.id,
    },
    {
      action: 'CREATE_SECRET',
      entityType: 'SECRET',
      entityId: randomUUID(),
      metadata: { secretKey: 'DATABASE_URL', environment: 'production' },
      userId: demoOwner.id,
      organizationId: demoOrg.id,
    },
    {
      action: 'INVITE_USER',
      entityType: 'USER',
      entityId: demoEditor.id,
      metadata: { email: demoEditor.email, role: 'EDITOR' },
      userId: demoOwner.id,
      organizationId: demoOrg.id,
    },
    {
      action: 'DEPLOY_CHANGE_REQUEST',
      entityType: 'CHANGE_REQUEST',
      entityId: 'change-request-2',
      metadata: { environment: 'staging', status: 'APPROVED' },
      userId: demoAdmin.id,
      organizationId: demoOrg.id,
    },
  ]

  for (const event of auditEvents) {
    await prisma.auditEvent.create({
      data: event,
    })
  }
  console.log('✅ Created audit events')

  // Create demo organization invitation
  await prisma.organizationInvitation.upsert({
    where: { token: 'demo-invitation-token' },
    update: {},
    create: {
      email: 'newuser@demo.com',
      role: Role.VIEWER,
      token: 'demo-invitation-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      organizationId: demoOrg.id,
      invitedById: demoOwner.id,
    },
  })
  console.log('✅ Created demo invitation')

  // Create demo agent executions
  const agentExecutions = [
    {
      agentType: 'CODE_ANALYZER',
      input: { 
        repository: 'https://github.com/demo/web-app',
        branch: 'main',
        analysis_type: 'security'
      },
      output: {
        vulnerabilities: [],
        suggestions: ['Use environment variables for API keys'],
        score: 95
      },
      status: 'COMPLETED',
      environmentId: prodEnv.id,
      triggeredById: demoAdmin.id,
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    },
    {
      agentType: 'DEPLOYMENT_VALIDATOR',
      input: {
        changeRequestId: 'change-request-1',
        environment: 'production'
      },
      status: 'RUNNING',
      environmentId: prodEnv.id,
      triggeredById: demoEditor.id,
      startedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
    },
  ]

  for (const execution of agentExecutions) {
    await prisma.agentExecution.create({
      data: execution,
    })
  }
  console.log('✅ Created demo agent executions')

  console.log('🎉 Seeding completed successfully!')
  
  // Print summary
  console.log('\n📊 Database Summary:')
  console.log(`Organizations: ${await prisma.organization.count()}`)
  console.log(`Users: ${await prisma.user.count()}`)
  console.log(`Projects: ${await prisma.project.count()}`)
  console.log(`Environments: ${await prisma.environment.count()}`)
  console.log(`Secrets: ${await prisma.secret.count()}`)
  console.log(`Change Requests: ${await prisma.changeRequest.count()}`)
  console.log(`Audit Events: ${await prisma.auditEvent.count()}`)
  console.log(`Agent Executions: ${await prisma.agentExecution.count()}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })