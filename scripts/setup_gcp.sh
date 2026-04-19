#!/bin/bash

# setup_gcp.sh - Initialize Google Cloud Project for Health Guardian
# Usage: ./setup_gcp.sh <PROJECT_ID>

PROJECT_ID=$1
REGION="us-central1"
DB_INSTANCE_NAME="health-guardian-db"
DB_NAME="myprojectdb"
DB_USER="myprojectuser"
DB_PASS=$(openssl rand -base64 12) # Generate a random password

# Service Account Name
SA_NAME="github-deployer"

if [ -z "$PROJECT_ID" ]; then
    echo "Usage: ./setup_gcp.sh <PROJECT_ID>"
    exit 1
fi

echo "Setting up GCP Project: $PROJECT_ID in Region: $REGION"

# 1. Set the project
gcloud config set project $PROJECT_ID

# 2. Enable APIs
echo "Enabling necessary APIs..."
gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    compute.googleapis.com \
    iam.googleapis.com

# 3. Create Artifact Registry
echo "Creating Artifact Registry..."
gcloud artifacts repositories create health-guardian-repo \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for Health Guardian" 2>/dev/null || echo "Artifact Registry already exists, skipping."

# 4. Create Cloud SQL Instance
echo "Creating Cloud SQL Instance (PostgreSQL)..."
gcloud sql instances create $DB_INSTANCE_NAME \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=$REGION \
    --storage-type=HDD 2>/dev/null || echo "Cloud SQL instance already exists, skipping."

# 5. Create Database and User
echo "Creating Database and User..."
gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE_NAME 2>/dev/null || echo "Database already exists, skipping."
gcloud sql users create $DB_USER --instance=$DB_INSTANCE_NAME --password=$DB_PASS 2>/dev/null || echo "User already exists, skipping."

# 6. Setup Secret Manager
echo "Storing secrets in Secret Manager..."
# Check and create secrets if they don't exist
create_secret() {
    local name=$1
    local value=$2
    if ! gcloud secrets describe "$name" > /dev/null 2>&1; then
        echo -n "$value" | gcloud secrets create "$name" --data-file=- --replication-policy="automatic"
    else
        echo "Secret $name already exists, skipping creation."
    fi
}

create_secret "DB_PASSWORD" "$DB_PASS"
create_secret "DJANGO_SECRET_KEY" "$DJANGO_SECRET_KEY"
create_secret "DEEPSEEK_API_KEY" "$DEEPSEEK_API_KEY"
create_secret "OPENFDA_API_KEY" "$OPENFDA_API_KEY"

# 7. Create Service Account for GitHub Actions
echo "Creating Service Account for CI/CD..."
gcloud iam service-accounts create $SA_NAME \
    --display-name="GitHub Actions Deployer" 2>/dev/null || echo "Service account already exists, skipping."

# Grant Service Account access to secrets
echo "Granting secret access to $SA_NAME..."
for SECRET in "DB_PASSWORD" "DJANGO_SECRET_KEY" "DEEPSEEK_API_KEY" "OPENFDA_API_KEY"; do
    gcloud secrets add-iam-policy-binding $SECRET \
        --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" 2>/dev/null || true
done

# Wait for SA replication
echo "Waiting for IAM replication..."
sleep 5

# Assign Roles to the Project
for ROLE in "roles/run.admin" "roles/iam.serviceAccountUser" "roles/artifactregistry.writer" "roles/cloudbuild.builds.editor" "roles/cloudsql.client" "roles/iam.serviceAccountTokenCreator" "roles/cloudsql.admin" "roles/serviceusage.serviceUsageConsumer"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE" 2>/dev/null || true
done

# Grant "ActAs" permission on the Default Compute Service Account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
echo "Granting ActAs permission on default compute service account ($PROJECT_NUMBER)..."
gcloud iam service-accounts add-iam-policy-binding $PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" 2>/dev/null || true

# Generate Key for GitHub
echo "Generating Service Account Key..."
gcloud iam service-accounts keys create gcp-key.json \
    --iam-account=$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com

echo "--------------------------------------------------------"
echo "SETUP COMPLETE"
echo "--------------------------------------------------------"
echo "1. Database Password (saved to Secret Manager): $DB_PASS"
echo "2. Service Account Key saved to: gcp-key.json"
echo "   IMPORTANT: Add the content of gcp-key.json to your GitHub Repo Secrets as GCP_SA_KEY."
echo "--------------------------------------------------------"
