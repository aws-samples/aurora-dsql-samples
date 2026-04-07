# frozen_string_literal: true

# Provides a health check endpoint for the Application Load Balancer (ALB).
#
# The ALB uses this endpoint to determine if the ECS task is healthy
# and ready to receive traffic. Returns a 200 OK with a JSON body.
class HealthController < ActionController::Base
  # GET /health
  #
  # Returns a simple JSON response indicating the application is running.
  # This endpoint is intentionally lightweight and does not check database
  # connectivity to avoid false negatives during DSQL token rotation.
  def show
    render json: { status: "ok", timestamp: Time.current.iso8601 }, status: :ok
  end
end
