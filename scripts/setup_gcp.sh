#!/bin/bash

# setup_gcp.sh - Initialize Google Cloud Project for Health Guardian
# Usage: ./setup_gcp.sh <PROJECT_ID>

PROJECT_ID=$1
REGION="us-central1"
DB_INSTANCE_NAME="health-guardian-db"
DB_NAME="myprojectdb"
DB_USER="myprojectuser"
DB_PASS=$(openssl rand -base64 12) # Generate a random password

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
    compute.googleapis.com

# 3. Create Artifact Registry
echo "Creating Artifact Registry..."
gcloud artifacts repositories create health-guardian-repo \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for Health Guardian"

# 4. Create Cloud SQL Instance
echo "Creating Cloud SQL Instance (PostgreSQL)..."
gcloud sql instances create $DB_INSTANCE_NAME \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=$REGION \
    --storage-type=HDD

# 5. Create Database and User
echo "Creating Database and User..."
gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE_NAME
gcloud sql users create $DB_USER --instance=$DB_INSTANCE_NAME --password=$DB_PASS

# 6. Setup Secret Manager
echo "Storing secrets in Secret Manager..."
echo -n "$DB_PASS" | gcloud secrets create DB_PASSWORD --data-file=- --replication-policy="automatic"
echo -n "$DJANGO_SECRET_KEY" | gcloud secrets create DJANGO_SECRET_KEY --data-file=- --replication-policy="automatic"
echo -n "$DEEPSEEK_API_KEY" | gcloud secrets create DEEPSEEK_API_KEY --data-file=- --replication-policy="automatic"
echo -n "$OPENFDA_API_KEY" | gcloud secrets create OPENFDA_API_KEY --data-file=- --replication-policy="automatic"

# Grant Service Account access to secrets
for SECRET in "DB_PASSWORD" "DJANGO_SECRET_KEY" "DEEPSEEK_API_KEY" "OPENFDA_API_KEY"; do
    gcloud secrets add-iam-policy-binding $SECRET \
        --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor"
done

# 7. Create Service Account for GitHub Actions
echo "Creating Service Account for CI/CD..."
SA_NAME="github-deployer"
gcloud iam service-accounts create $SA_NAME \
    --display-name="GitHub Actions Deployer"

# Assign Roles
for ROLE in "roles/run.admin" "roles/iam.serviceAccountUser" "roles/artifactregistry.writer" "roles/cloudbuild.builds.editor" "roles/cloudsql.client"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE"
done

# Generate Key for GitHub
gcloud iam service-accounts keys create gcp-key.json \
    --iam-account=$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com

echo "--------------------------------------------------------"
echo "SETUP COMPLETE"
echo "--------------------------------------------------------"
echo "1. Database Password (saved to Secret Manager): $DB_PASS"
echo "2. Service Account Key saved to: gcp-key.json"
echo "   IMPORTANT: Add the content of gcp-key.json to your GitHub Repo Secrets as GCP_SA_KEY."
echo "3. Remember to add your OPENAI_API_KEY and ANTHROPIC_API_KEY to Secret Manager."
echo "--------------------------------------------------------"
