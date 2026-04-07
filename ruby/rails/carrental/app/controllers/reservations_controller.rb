# frozen_string_literal: true

# Handles CRUD operations for vehicle rental reservations.
#
# Provides standard RESTful actions: index, show, new, create,
# edit, update, and destroy. Loads available vehicles and customers
# for form dropdowns.
class ReservationsController < ApplicationController
  before_action :set_reservation, only: %i[show edit update destroy]
  before_action :load_form_data, only: %i[new create edit update]

  # GET /reservations
  #
  # Lists all reservations with associated customer and vehicle data.
  def index
    @reservations = Reservation.includes(:customer, :vehicle).order(start_date: :desc)
  end

  # GET /reservations/:id
  #
  # Displays details for a single reservation.
  def show
  end

  # GET /reservations/new
  #
  # Renders the form for creating a new reservation.
  def new
    @reservation = Reservation.new
  end

  # POST /reservations
  #
  # Creates a new reservation with the provided parameters.
  # The total price is automatically calculated by the model callback.
  def create
    @reservation = Reservation.new(reservation_params)

    if @reservation.save
      redirect_to @reservation, notice: "Reservation was successfully created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  # GET /reservations/:id/edit
  #
  # Renders the form for editing an existing reservation.
  def edit
  end

  # PATCH/PUT /reservations/:id
  #
  # Updates an existing reservation with the provided parameters.
  def update
    if @reservation.update(reservation_params)
      redirect_to @reservation, notice: "Reservation was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  # DELETE /reservations/:id
  #
  # Removes a reservation. Active reservations cannot be deleted —
  # they must be cancelled or completed first.
  def destroy
    if @reservation.destroy
      redirect_to reservations_path, notice: "Reservation was successfully deleted.", status: :see_other
    else
      redirect_to @reservation, alert: @reservation.errors.full_messages.join(", ")
    end
  end

  private

  # Finds the reservation by ID for member actions.
  def set_reservation
    @reservation = Reservation.find(params[:id])
  end

  # Loads vehicles and customers for form dropdown selections.
  # Excludes vehicles in maintenance from the vehicle list, but includes
  # the currently selected vehicle (for edit forms) even if it's in maintenance.
  def load_form_data
    @vehicles = Vehicle.where.not(status: "maintenance").order(:make, :model)
    # Include the currently assigned vehicle even if it's now in maintenance (for edit)
    if @reservation&.vehicle_id.present? && !@vehicles.exists?(id: @reservation.vehicle_id)
      current_vehicle = Vehicle.find_by(id: @reservation.vehicle_id)
      @vehicles = @vehicles.or(Vehicle.where(id: current_vehicle.id)) if current_vehicle
    end
    @customers = Customer.all.order(:name)
  end

  # Permits only the expected reservation parameters through strong parameters.
  def reservation_params
    params.require(:reservation).permit(:customer_id, :vehicle_id, :start_date, :end_date, :status)
  end
end
