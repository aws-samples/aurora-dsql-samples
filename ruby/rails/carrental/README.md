# Car Rental Reservation Application

## Getting Started with Ruby on Rails and Amazon Aurora DSQL

A car rental reservation application built with **Ruby on Rails 7.2** and **Amazon Aurora DSQL**, demonstrating how to integrate Rails with Aurora DSQL using IAM-based authentication, UUID primary keys, and DSQL-compatible Active Record configuration.

This application manages **vehicles**, **customers**, and **reservations**, and is deployed on AWS using **ECS Fargate** behind an **Application Load Balancer**.

---

## Table of Contents

- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Data Model](#data-model)
- [Key Design Decisions for Aurora DSQL](#key-design-decisions-for-aurora-dsql)
- [Prerequisites](#prerequisites)
- [Step-by-Step Deployment Guide](#step-by-step-deployment-guide)
  - [Step 1: Install Required Tools](#step-1-install-required-tools)
  - [Step 2: Configure AWS CLI Credentials](#step-2-configure-aws-cli-credentials)
  - [Step 3: Choose Your AWS Region](#step-3-choose-your-aws-region)
  - [Step 4: Create an Aurora DSQL Cluster](#step-4-create-an-aurora-dsql-cluster)
  - [Step 5: Find Your AWS Account ID](#step-5-find-your-aws-account-id)
  - [Step 6: Determine Your Public IP Address](#step-6-determine-your-public-ip-address)
  - [Step 7: Choose a VPC CIDR Block](#step-7-choose-a-vpc-cidr-block)
  - [Step 8: Run the Deploy Script](#step-8-run-the-deploy-script)
  - [Step 9: Wait for Deployment to Complete](#step-9-wait-for-deployment-to-complete)
  - [Step 10: Access the Application](#step-10-access-the-application)
- [Deploy Script Reference](#deploy-script-reference)
- [Local Development](#local-development)
- [Project Structure](#project-structure)
- [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)
- [Tear Down](#tear-down)
- [References](#references)

---

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Internet   │────▶│  ALB (Port 80)   │────▶│  ECS Service        │
│  (Public IP) │     │  (Security Group  │     │  (Rails App on      │
│              │     │   restricts to    │     │   Puma, Port 3000)  │
│              │     │   allowed IP)     │     │                     │
└──────────────┘     └──────────────────┘     └─────────┬───────────┘
                                                         │
                                                         │ IAM Auth Token
                                                         │ (SSL/TLS)
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Amazon Aurora DSQL  │
                                              │  (Pre-created        │
                                              │   Cluster)           │
                                              └─────────────────────┘
```

The application runs in **private subnets** behind a **NAT Gateway** for outbound internet access (ECR image pulls, DSQL connectivity). The **ALB** sits in **public subnets** and restricts inbound HTTP traffic to a single specified IP address. All database connections use **IAM-based token authentication** over **SSL/TLS**.

### AWS Resources Created by the Deployment

| Resource | Purpose |
|----------|---------|
| **VPC** | Isolated network with configurable CIDR block |
| **2 Public Subnets** | Host the ALB across 2 Availability Zones |
| **2 Private Subnets** | Host ECS Fargate tasks across 2 Availability Zones |
| **Internet Gateway** | Public subnet internet access |
| **NAT Gateway + Elastic IP** | Private subnet outbound access (ECR, DSQL) |
| **Application Load Balancer** | Routes HTTP traffic to ECS tasks |
| **ALB Security Group** | Restricts inbound port 80 to your IP |
| **ECS Cluster (Fargate)** | Container orchestration |
| **ECS Service + Task Definition** | Runs the Rails application container |
| **ECS Security Group** | Allows inbound only from ALB on port 3000 |
| **ECR Repository** | Stores the Docker image |
| **ECS Task Execution Role** | Permissions to pull ECR images and write logs |
| **ECS Task Role** | Permissions for `dsql:DbConnectAdmin` (IAM auth tokens) |
| **CloudWatch Log Group** | Container log aggregation (7-day retention) |

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | Ruby on Rails 7.2 |
| Language | Ruby 3.3 |
| Database | Amazon Aurora DSQL (PostgreSQL-compatible) |
| Web Server | Puma |
| Container | Docker (multi-stage build with jemalloc) |
| Orchestration | Amazon ECS (Fargate) |
| Load Balancer | Application Load Balancer (ALB) |
| Infrastructure | AWS CloudFormation |
| Authentication | IAM-based token auth (`aurora-dsql-ruby-pg`) |
| Frontend | Hotwire (Turbo + Stimulus), Import Maps |
| Dev Database | SQLite3 (no PostgreSQL required locally) |

---

## Data Model

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│   customers  │       │   reservations   │       │   vehicles   │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id (UUID PK) │◀──┐   │ id (UUID PK)     │   ┌──▶│ id (UUID PK) │
│ name         │   └───│ customer_id (UUID)│   │   │ make         │
│ email        │       │ vehicle_id (UUID) │───┘   │ model        │
│ phone        │       │ start_date        │       │ year         │
│ license_no   │       │ end_date          │       │ color        │
│ created_at   │       │ status            │       │ license_plate│
│ updated_at   │       │ total_price       │       │ daily_rate   │
└──────────────┘       │ created_at        │       │ status       │
                       │ updated_at        │       │ mileage      │
                       └──────────────────┘       │ created_at   │
                                                   │ updated_at   │
                                                   └──────────────┘
```

| Table | Description |
|-------|-------------|
| `vehicles` | Fleet vehicles with make, model, year, daily rate, and status (`available`, `rented`, `maintenance`) |
| `customers` | Customer information with name, email, phone, and driver's license number |
| `reservations` | Rental reservations linking customers to vehicles with dates, status (`pending`, `active`, `completed`, `cancelled`), and auto-calculated pricing |

> **Note:** Foreign key constraints are not supported by Aurora DSQL. Referential integrity is enforced at the application layer through Active Record associations and validations.

---

## Key Design Decisions for Aurora DSQL

| Decision | Rationale |
|----------|-----------|
| **UUID Primary Keys** | Aurora DSQL does not support sequences or `SERIAL` columns. All tables use UUID primary keys generated in Ruby via `SecureRandom.uuid`. |
| **No Foreign Key Constraints** | DSQL does not support foreign key constraints. Relationships are enforced through Active Record `belongs_to`/`has_many` associations and presence validations. |
| **IAM Token Authentication** | Instead of static passwords, the application generates short-lived IAM authentication tokens on each new database connection via the `aurora-dsql-ruby-pg` gem. |
| **Disabled PostgreSQL Features** | The DSQL adapter initializer disables `prepared_statements`, `advisory_locks`, `supports_ddl_transactions?`, `client_min_messages=`, and `set_standard_conforming_strings` — none of which are supported by DSQL. |
| **SSL Required** | All connections use `sslmode: verify-full` with `sslnegotiation: direct` and the Amazon Root CA certificate. |
| **SQLite3 for Development** | Local development uses SQLite3 so developers don't need a PostgreSQL installation. The DSQL adapter initializer only activates when the PostgreSQL adapter is in use (production). |

---

## Prerequisites

Before deploying, you need the following installed and configured on your local machine:

| Prerequisite | Version | Purpose | Installation |
|-------------|---------|---------|-------------|
| **AWS CLI** | v2.x | AWS resource management | [Install Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| **Docker** | 20.x+ | Build and push container images | [Install Guide](https://docs.docker.com/get-docker/) |
| **jq** | 1.6+ | JSON parsing in the deploy script | [Install Guide](https://jqlang.github.io/jq/download/) |
| **openssl** | Any | Auto-generate Rails secret key (if not provided) | Pre-installed on most systems |
| **Bash** | 4.x+ | Run the deploy script | Pre-installed on macOS/Linux |

### Required IAM Permissions

Your AWS CLI credentials must have sufficient permissions to create the following resources:

- **VPC**: `ec2:CreateVpc`, `ec2:CreateSubnet`, `ec2:CreateInternetGateway`, `ec2:CreateNatGateway`, `ec2:CreateRouteTable`, `ec2:CreateRoute`, `ec2:CreateSecurityGroup`, `ec2:AllocateAddress`, and associated `Describe`/`Modify`/`Attach` permissions
- **ECS**: `ecs:CreateCluster`, `ecs:CreateService`, `ecs:RegisterTaskDefinition`
- **ECR**: `ecr:CreateRepository`, `ecr:GetAuthorizationToken`, `ecr:PutImage`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`
- **IAM**: `iam:CreateRole`, `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:PassRole`
- **ELB**: `elasticloadbalancing:CreateLoadBalancer`, `elasticloadbalancing:CreateTargetGroup`, `elasticloadbalancing:CreateListener`
- **CloudWatch Logs**: `logs:CreateLogGroup`
- **CloudFormation**: `cloudformation:CreateStack`, `cloudformation:UpdateStack`, `cloudformation:DescribeStacks`, `cloudformation:DescribeStackEvents`
- **Aurora DSQL**: `dsql:CreateCluster`, `dsql:DescribeCluster` (for cluster creation)
- **STS**: `sts:GetCallerIdentity` (for credential validation)

> **Tip:** If you have `AdministratorAccess` or `PowerUserAccess`, you have all the permissions needed.

---

## Step-by-Step Deployment Guide

Follow these steps in order to deploy the application to your AWS account.

### Step 1: Install Required Tools

Verify that all required tools are installed:

```bash
# Check AWS CLI
aws --version
# Expected: aws-cli/2.x.x ...

# Check Docker
docker --version
# Expected: Docker version 20.x.x or higher

# Check that Docker daemon is running
docker info > /dev/null 2>&1 && echo "Docker is running" || echo "Docker is NOT running"

# Check jq
jq --version
# Expected: jq-1.6 or higher
```

If any tool is missing, install it using the links in the [Prerequisites](#prerequisites) section.

### Step 2: Configure AWS CLI Credentials

Ensure your AWS CLI is configured with valid credentials that have the [required IAM permissions](#required-iam-permissions):

```bash
# Configure credentials (if not already done)
aws configure

# Verify your credentials are working
aws sts get-caller-identity
```

You should see output like:

```json
{
    "UserId": "AIDAEXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

> **Note:** If you use named profiles, set the `AWS_PROFILE` environment variable before running the deploy script: `export AWS_PROFILE=your-profile-name`

### Step 3: Choose Your AWS Region

Aurora DSQL is available in select regions. The CloudFormation template supports the following regions:

- `us-east-1` (N. Virginia)
- `us-east-2` (Ohio)
- `us-west-1` (N. California)
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- `eu-central-1` (Frankfurt)
- `ap-southeast-1` (Singapore)
- `ap-northeast-1` (Tokyo)

> **Important:** Verify that Aurora DSQL is available in your chosen region by checking the [Aurora DSQL documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/). If DSQL is not available in a region, the cluster creation in Step 4 will fail.

For this guide, we'll use `us-east-1`. Replace it with your chosen region in all subsequent commands.

### Step 4: Create an Aurora DSQL Cluster

The Aurora DSQL cluster must be created **before** running the deploy script, as it is not managed by CloudFormation.

```bash
aws dsql create-cluster \
  --region us-east-1 \
  --no-deletion-protection-enabled \
  --tags Project=car-rental,Environment=dev,Name=ror-dsql
```

This command returns a JSON response containing the cluster identifier:

```json
{
    "identifier": "abc123xyz456",
    "arn": "arn:aws:dsql:us-east-1:123456789012:cluster/abc123xyz456",
    "status": "CREATING",
    ...
}
```

**Save the `identifier` value** (e.g., `abc123xyz456`) — you will need it in Step 8.

Wait for the cluster to become active (this typically takes a few seconds):

```bash
aws dsql describe-cluster \
  --identifier abc123xyz456 \
  --region us-east-1 \
  --query 'status' \
  --output text
```

Repeat until the output shows `ACTIVE`.

> **Note:** The DSQL endpoint will be automatically constructed by the deploy script as `<cluster-id>.dsql.<region>.on.aws` (e.g., `abc123xyz456.dsql.us-east-1.on.aws`).

### Step 5: Find Your AWS Account ID

You need your 12-digit AWS Account ID for the deploy script:

```bash
aws sts get-caller-identity --query 'Account' --output text
```

This returns your account ID, e.g., `123456789012`.

### Step 6: Determine Your Public IP Address

The ALB security group restricts access to a single public IP address. Find your current public IP:

```bash
curl -s https://checkip.amazonaws.com
```

This returns your IP, e.g., `203.0.113.42`. The deploy script will automatically append `/32` to make it a valid CIDR block.

> **Important:** If your IP address changes (e.g., you're on a dynamic IP or switch networks), you will need to update the ALB security group or redeploy with the new IP.

### Step 7: Choose a VPC CIDR Block

Choose a CIDR block for the new VPC that does not conflict with any existing VPCs in your account/region. Common choices:

- `10.0.0.0/16` (65,536 addresses)
- `10.1.0.0/16` (if `10.0.0.0/16` is already in use)
- `172.16.0.0/16`

To check existing VPCs in your region:

```bash
aws ec2 describe-vpcs \
  --region us-east-1 \
  --query 'Vpcs[].CidrBlock' \
  --output text
```

### Step 8: Run the Deploy Script

With all the information gathered, run the deploy script from the project root directory:

```bash
./deploy.sh \
  --account 123456789012 \
  --region us-east-1 \
  --vpc-cidr 10.0.0.0/16 \
  --my-ip $(curl -s https://checkip.amazonaws.com) \
  --dsql-cluster-id abc123xyz456
```

Replace the values with your own:

| Parameter | Replace With |
|-----------|-------------|
| `123456789012` | Your 12-digit AWS Account ID from Step 5 |
| `us-east-1` | Your chosen region from Step 3 |
| `10.0.0.0/16` | Your chosen VPC CIDR from Step 7 |
| `$(curl -s https://checkip.amazonaws.com)` | Your public IP (auto-detected), or type it manually |
| `abc123xyz456` | Your DSQL cluster identifier from Step 4 |

> **Tip:** If the script is not executable, run `chmod +x deploy.sh` first.

### Step 9: Wait for Deployment to Complete

The deploy script performs the following automatically:

1. **Validates prerequisites** — checks for AWS CLI, Docker, jq, and valid AWS credentials
2. **Cleans up orphaned resources** — removes leftover ECR repositories from failed previous deploys
3. **Launches CloudFormation** in the background — creates VPC, subnets, NAT Gateway, ALB, ECS cluster, security groups, IAM roles, and ECR repository
4. **Waits for ECR** — polls until the ECR repository is created by CloudFormation
5. **Builds the Docker image** in parallel while CloudFormation continues provisioning
6. **Pushes the image to ECR** — authenticates and uploads the container image
7. **Waits for CloudFormation** to finish creating all remaining resources (ECS service, ALB listener, etc.)
8. **Displays deployment outputs** — ALB URL, ECS cluster/service names, log group

The full deployment takes approximately **10–15 minutes**, primarily due to CloudFormation provisioning the NAT Gateway and ALB.

When complete, you'll see output like:

```
=============================================
  Deployment Complete
=============================================

[OK]    Application URL:  http://car-r-Appli-XXXXXXXXXXXX-XXXXXXXXXX.us-east-1.elb.amazonaws.com
[OK]    ECR Repository:   123456789012.dkr.ecr.us-east-1.amazonaws.com/car-rental-ecr-repo
[OK]    ECS Cluster:      car-rental-stack-ECSCluster-XXXXXXXXXXXX
[OK]    ECS Service:      car-rental-stack-ECSService-XXXXXXXXXXXX
[OK]    Log Group:        /ecs/car-rental/rails
```

### Step 10: Access the Application

Open the **Application URL** from the deployment output in your web browser.

> **Important:** It may take **1–2 additional minutes** after deployment completes for the ECS task to start, pass health checks, and for the ALB to begin routing traffic. During this time you may see a `503 Service Temporarily Unavailable` error — this is normal.

On first boot, the container automatically:
1. Creates the `car_rental` schema in Aurora DSQL
2. Runs all database migrations (`rails db:prepare`)
3. Starts the Puma web server

Once the application is ready, you can:
- **Browse vehicles** at the root URL
- **Manage customers** via the "Customers" navigation link
- **Create reservations** via the "Reservations" navigation link

To seed the database with sample data, use ECS Exec:

```bash
aws ecs execute-command \
  --cluster <ECS_CLUSTER_NAME> \
  --task <TASK_ID> \
  --container car-rental-container \
  --interactive \
  --command "./bin/rails db:seed"
```

To find the task ID:

```bash
aws ecs list-tasks \
  --cluster <ECS_CLUSTER_NAME> \
  --service-name <ECS_SERVICE_NAME> \
  --region us-east-1 \
  --query 'taskArns[0]' \
  --output text
```

---

## Deploy Script Reference

| Flag | Required | Description |
|------|----------|-------------|
| `--account` | Yes | 12-digit AWS Account ID |
| `--region` | Yes | AWS region (e.g., `us-east-1`) |
| `--vpc-cidr` | Yes | VPC CIDR block (e.g., `10.0.0.0/16`) |
| `--my-ip` | Yes | Your public IP address (auto-appends `/32` if no CIDR prefix) |
| `--dsql-cluster-id` | Yes | Aurora DSQL cluster identifier |
| `--secret-key` | No | Rails `SECRET_KEY_BASE` (auto-generated via `openssl rand -hex 64` if omitted) |
| `--stack-name` | No | CloudFormation stack name (default: `car-rental-stack`) |
| `--image-tag` | No | Docker image tag (default: `latest`) |

---

## Local Development

The application uses **SQLite3** for local development, so no PostgreSQL or Aurora DSQL connection is needed.

### Setup

```bash
# Install Ruby 3.3 (using your preferred version manager)
# e.g., with rbenv: rbenv install 3.3.0

# Install dependencies
bundle install

# Create the database and run migrations
bin/rails db:prepare

# Seed with sample data (optional)
bin/rails db:seed

# Start the development server
bin/rails server
```

The application will be available at `http://localhost:3000`.

### Development vs. Production Differences

| Feature | Development | Production |
|---------|-------------|------------|
| Database | SQLite3 | Aurora DSQL (PostgreSQL) |
| Primary Key Generation | Ruby `SecureRandom.uuid` | Ruby `SecureRandom.uuid` |
| DSQL Adapter Initializer | Skipped (not PostgreSQL) | Active (injects IAM tokens) |
| SSL | Not required | `verify-full` with Amazon Root CA |
| Static Files | Rails serves directly | Rails serves directly (Puma) |
| Logging | File-based | STDOUT (CloudWatch) |

---

## Project Structure

```
car-rental/
├── app/
│   ├── assets/stylesheets/     # Application CSS (no framework)
│   ├── controllers/            # Rails controllers (CRUD + health check)
│   ├── helpers/                # View helpers
│   ├── javascript/             # Stimulus controllers, Turbo
│   ├── models/                 # Active Record models (Vehicle, Customer, Reservation)
│   └── views/                  # ERB templates
├── bin/                        # Rails binstubs + Docker entrypoint
├── config/
│   ├── database.yml            # SQLite3 (dev/test) + Aurora DSQL (production)
│   ├── environments/           # Development, test, production configs
│   ├── initializers/
│   │   └── dsql_adapter.rb     # IAM token auth + DSQL compatibility patches
│   ├── puma.rb                 # Puma web server config
│   └── routes.rb               # Application routes
├── db/
│   ├── migrate/                # UUID-based migrations (no foreign keys)
│   ├── schema.rb               # Current schema definition
│   └── seeds.rb                # Sample data (vehicles, customers, reservations)
├── infrastructure/
│   └── cloudformation.yml      # Complete AWS infrastructure template
├── deploy.sh                   # Single-pass parallel deployment script
├── Dockerfile                  # Multi-stage build (Ruby 3.3-slim + jemalloc)
├── Gemfile                     # Dependencies
└── DESIGN_SPECIFICATION.md     # Detailed design document
```

---

## Monitoring and Troubleshooting

### View Application Logs

```bash
aws logs tail /ecs/car-rental/rails --region us-east-1 --follow
```

### Check ECS Service Status

```bash
aws ecs describe-services \
  --cluster <CLUSTER_NAME> \
  --services <SERVICE_NAME> \
  --region us-east-1 \
  --query 'services[0].{status:status,desiredCount:desiredCount,runningCount:runningCount,deployments:deployments}' \
  --no-cli-pager
```

### List Running Tasks

```bash
aws ecs list-tasks \
  --cluster <CLUSTER_NAME> \
  --service-name <SERVICE_NAME> \
  --region us-east-1 \
  --no-cli-pager
```

### Execute Command in Running Container

```bash
aws ecs execute-command \
  --cluster <CLUSTER_NAME> \
  --task <TASK_ID> \
  --container car-rental-container \
  --interactive \
  --command "/bin/bash"
```

### Open a Rails Console in the Container

```bash
aws ecs execute-command \
  --cluster <CLUSTER_NAME> \
  --task <TASK_ID> \
  --container car-rental-container \
  --interactive \
  --command "./bin/rails console"
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `503 Service Temporarily Unavailable` | ECS task still starting or health checks not yet passing | Wait 1–2 minutes after deployment; check ECS service status and logs |
| Deploy script fails at "Checking prerequisites" | Missing AWS CLI, Docker, or jq | Install the missing tool (see [Prerequisites](#prerequisites)) |
| Deploy script fails at "AWS credentials" | Invalid or expired credentials | Run `aws configure` or refresh your session token |
| CloudFormation `CREATE_FAILED` | Insufficient IAM permissions or resource limits | Check stack events: `aws cloudformation describe-stack-events --stack-name car-rental-stack --region us-east-1 --no-cli-pager` |
| `Cannot connect to database` in logs | DSQL cluster not active, or IAM role missing `dsql:DbConnectAdmin` | Verify cluster status and that the ECS task role has the correct policy |
| ALB returns `504 Gateway Timeout` | Rails app crashed or `db:prepare` is still running | Check CloudWatch logs for errors |
| Can't access ALB from browser | Your IP changed since deployment | Update the ALB security group inbound rule, or redeploy with `--my-ip <new-ip>` |

---

## Tear Down

To remove all AWS resources created by the deployment:

### 1. Delete the CloudFormation Stack

This removes the VPC, ALB, ECS cluster, ECR repository, IAM roles, and all other resources:

```bash
aws cloudformation delete-stack \
  --stack-name car-rental-stack \
  --region us-east-1
```

Wait for deletion to complete:

```bash
aws cloudformation wait stack-delete-complete \
  --stack-name car-rental-stack \
  --region us-east-1
```

### 2. Delete the Aurora DSQL Cluster

The DSQL cluster was created separately and is **not** managed by CloudFormation:

```bash
aws dsql delete-cluster \
  --identifier <CLUSTER_ID> \
  --region us-east-1
```

> **Warning:** Deleting the DSQL cluster permanently destroys all data stored in it. This action cannot be undone.

---

## References

- [Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/)
- [Aurora DSQL Ruby pg Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/ruby/pg)
- [Aurora DSQL Samples (Rails)](https://github.com/aws-samples/aurora-dsql-samples/tree/main/ruby/rails)
- [Aurora DSQL SQL Compatibility](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html)
- [Ruby on Rails Guides](https://guides.rubyonrails.org/)
- [ECS Exec for Debugging](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html)
