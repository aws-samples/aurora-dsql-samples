#!/bin/bash

# Aurora DSQL JDBC Wrapper with HikariCP - Environment Setup Script
# This script helps you set up the required environment variables

echo "Aurora DSQL JDBC Wrapper with HikariCP - Environment Setup"
echo "=========================================================="
echo

# Function to prompt for input with default value
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " input
        export $var_name="${input:-$default}"
    else
        read -p "$prompt: " input
        export $var_name="$input"
    fi
}

# Function to prompt for optional input
prompt_optional() {
    local prompt="$1"
    local var_name="$2"
    
    read -p "$prompt (optional): " input
    if [ -n "$input" ]; then
        export $var_name="$input"
    fi
}

echo "Setting up environment variables for Aurora DSQL JDBC Wrapper with HikariCP..."
echo

# Required variables
echo "Required Configuration:"
echo "----------------------"

# Get current values if they exist
current_user="${CLUSTER_USER:-admin}"
current_region="${REGION:-us-east-1}"

prompt_with_default "Aurora DSQL cluster user" "$current_user" "CLUSTER_USER"

echo
echo "Choose connection method:"
echo "1. Full Aurora DSQL endpoint (e.g., cluster-id.dsql.region.on.aws)"
echo "2. Cluster ID and Region (recommended)"
read -p "Enter choice [1 or 2]: " connection_choice

if [ "$connection_choice" = "1" ]; then
    prompt_with_default "Aurora DSQL cluster endpoint" "$CLUSTER_ENDPOINT" "CLUSTER_ENDPOINT"
else
    prompt_with_default "Aurora DSQL cluster ID" "$CLUSTER_ID" "CLUSTER_ID"
    prompt_with_default "AWS region" "$current_region" "REGION"
fi

echo
echo "Environment variables set:"
echo "========================="
echo "CLUSTER_USER=$CLUSTER_USER"

if [ -n "$CLUSTER_ENDPOINT" ]; then
    echo "CLUSTER_ENDPOINT=$CLUSTER_ENDPOINT"
fi

if [ -n "$CLUSTER_ID" ]; then
    echo "CLUSTER_ID=$CLUSTER_ID"
fi

if [ -n "$REGION" ]; then
    echo "REGION=$REGION"
fi

echo
echo "To persist these variables, add them to your shell profile:"
echo "export CLUSTER_USER=\"$CLUSTER_USER\""

if [ -n "$CLUSTER_ENDPOINT" ]; then
    echo "export CLUSTER_ENDPOINT=\"$CLUSTER_ENDPOINT\""
fi

if [ -n "$CLUSTER_ID" ]; then
    echo "export CLUSTER_ID=\"$CLUSTER_ID\""
fi

if [ -n "$REGION" ]; then
    echo "export REGION=\"$REGION\""
fi

echo
echo "You can now run the example:"
echo "./gradlew run"
echo "./gradlew runExample"
echo
echo "Setup complete!"
