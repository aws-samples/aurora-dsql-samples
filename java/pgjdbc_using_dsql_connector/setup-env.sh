#!/bin/bash

# Aurora DSQL JDBC Wrapper - Environment Setup Script
# This script helps you set up the required environment variables

echo "Aurora DSQL JDBC Wrapper - Environment Setup"
echo "============================================="
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

echo "Setting up environment variables for Aurora DSQL JDBC Wrapper..."
echo

# Required variables
echo "Required Configuration:"
echo "----------------------"

# Get current values if they exist
current_user="${CLUSTER_USER:-admin}"
current_endpoint="${CLUSTER_ENDPOINT}"

prompt_with_default "Aurora DSQL cluster user" "$current_user" "CLUSTER_USER"
prompt_with_default "Aurora DSQL cluster endpoint (e.g., cluster-id.dsql.region.on.aws)" "$current_endpoint" "CLUSTER_ENDPOINT"

echo
echo "Optional Configuration:"
echo "----------------------"

prompt_optional "AWS profile name" "PROFILE"
prompt_optional "IAM role ARN for assume role" "ROLE_ARN"

echo
echo "Environment variables set:"
echo "========================="
echo "CLUSTER_USER=$CLUSTER_USER"
echo "CLUSTER_ENDPOINT=$CLUSTER_ENDPOINT"

if [ -n "$PROFILE" ]; then
    echo "PROFILE=$PROFILE"
fi

if [ -n "$ROLE_ARN" ]; then
    echo "ROLE_ARN=$ROLE_ARN"
fi

echo
echo "To persist these variables, add them to your shell profile:"
echo "export CLUSTER_USER=\"$CLUSTER_USER\""
echo "export CLUSTER_ENDPOINT=\"$CLUSTER_ENDPOINT\""

if [ -n "$PROFILE" ]; then
    echo "export PROFILE=\"$PROFILE\""
fi

if [ -n "$ROLE_ARN" ]; then
    echo "export ROLE_ARN=\"$ROLE_ARN\""
fi

echo
echo "You can now run the examples:"
echo "./gradlew run"
echo "./gradlew runBasicConnection"
echo "./gradlew runTransaction"
echo "./gradlew runPreparedStatement"
echo "./gradlew runCustomCredentials"
echo
echo "Setup complete!"
