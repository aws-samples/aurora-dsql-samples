# frozen_string_literal: true

# Handles CRUD operations for customers in the car rental system.
#
# Provides standard RESTful actions: index, show, new, create,
# edit, update, and destroy.
class CustomersController < ApplicationController
  before_action :set_customer, only: %i[show edit update destroy]

  # GET /customers
  #
  # Lists all customers.
  def index
    @customers = Customer.all.order(:name)
  end

  # GET /customers/:id
  #
  # Displays details for a single customer, including their reservations.
  def show
    @reservations = @customer.reservations.includes(:vehicle).order(start_date: :desc)
  end

  # GET /customers/new
  #
  # Renders the form for creating a new customer.
  def new
    @customer = Customer.new
  end

  # POST /customers
  #
  # Creates a new customer with the provided parameters.
  def create
    @customer = Customer.new(customer_params)

    if @customer.save
      redirect_to @customer, notice: "Customer was successfully created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  # GET /customers/:id/edit
  #
  # Renders the form for editing an existing customer.
  def edit
  end

  # PATCH/PUT /customers/:id
  #
  # Updates an existing customer with the provided parameters.
  def update
    if @customer.update(customer_params)
      redirect_to @customer, notice: "Customer was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  # DELETE /customers/:id
  #
  # Removes a customer from the system.
  # Prevents deletion if the customer has any associated reservations.
  def destroy
    if @customer.destroy
      redirect_to customers_path, notice: "Customer was successfully deleted.", status: :see_other
    else
      redirect_to @customer, alert: "Cannot delete customer: #{@customer.errors.full_messages.join(', ')}"
    end
  end

  private

  # Finds the customer by ID for member actions.
  def set_customer
    @customer = Customer.find(params[:id])
  end

  # Permits only the expected customer parameters through strong parameters.
  def customer_params
    params.require(:customer).permit(:name, :email, :phone, :license_number)
  end
end
