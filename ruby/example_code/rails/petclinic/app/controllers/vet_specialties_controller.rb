class VetSpecialtiesController < ApplicationController
  def index
    @vetspecialties = VetSpecialties.all
  end

  def show
    @vetspecialty = VetSpecialties.find(params[:id])
  end
end
