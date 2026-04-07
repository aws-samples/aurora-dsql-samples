# frozen_string_literal: true

# =============================================================================
# Application Routes
# =============================================================================
#
# Defines the URL structure for the Car Rental application.
# For details on the DSL available within this file, see:
#   https://guides.rubyonrails.org/routing.html

Rails.application.routes.draw do
  # Root path — displays the vehicle fleet listing
  root "vehicles#index"

  # RESTful resource routes for core entities
  resources :vehicles
  resources :customers
  resources :reservations

  # Health check endpoint for ALB target group health checks.
  # Returns 200 OK when the application is running.
  get "health" => "health#show"
end
