class VetsController < ApplicationController
  def index
    @vets = Vet.all
  end

  def show
    @vet = Vet.find(params[:id])
  end
end
