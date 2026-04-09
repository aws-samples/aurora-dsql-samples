# frozen_string_literal: true

# Handles CRUD operations for vehicles in the car rental fleet.
#
# Provides standard RESTful actions: index, show, new, create,
# edit, update, and destroy.
class VehiclesController < ApplicationController
  before_action :set_vehicle, only: %i[show edit update destroy]

  # GET /vehicles
  #
  # Lists all vehicles in the fleet.
  def index
    @vehicles = Vehicle.all.order(:make, :model)
  end

  # GET /vehicles/:id
  #
  # Displays details for a single vehicle, including its reservations.
  def show
    @reservations = @vehicle.reservations.includes(:customer).order(start_date: :desc)
  end

  # GET /vehicles/new
  #
  # Renders the form for creating a new vehicle.
  def new
    @vehicle = Vehicle.new
  end

  # POST /vehicles
  #
  # Creates a new vehicle with the provided parameters.
  def create
    @vehicle = Vehicle.new(vehicle_params)

    if @vehicle.save
      redirect_to @vehicle, notice: "Vehicle was successfully created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  # GET /vehicles/:id/edit
  #
  # Renders the form for editing an existing vehicle.
  def edit
  end

  # PATCH/PUT /vehicles/:id
  #
  # Updates an existing vehicle with the provided parameters.
  def update
    if @vehicle.update(vehicle_params)
      redirect_to @vehicle, notice: "Vehicle was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  # DELETE /vehicles/:id
  #
  # Removes a vehicle from the fleet.
  # Prevents deletion if the vehicle has any associated reservations.
  def destroy
    if @vehicle.destroy
      redirect_to vehicles_path, notice: "Vehicle was successfully deleted.", status: :see_other
    else
      redirect_to @vehicle, alert: "Cannot delete vehicle: #{@vehicle.errors.full_messages.join(', ')}"
    end
  end

  private

  # Finds the vehicle by ID for member actions.
  def set_vehicle
    @vehicle = Vehicle.find(params[:id])
  end

  # Permits only the expected vehicle parameters through strong parameters.
  def vehicle_params
    params.require(:vehicle).permit(:make, :model, :year, :color, :license_plate, :daily_rate, :status, :mileage)
  end
end
