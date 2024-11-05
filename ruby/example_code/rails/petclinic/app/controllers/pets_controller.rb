class PetsController < ApplicationController
  def create
    @owner = Owner.find(params[:owner_id])
    @pet = @owner.pets.create(pet_params)
    redirect_to owner_path(@owner)
  end

  private
    def pet_params
      params.require(:pet).permit(:name, :birth_date)
    end
end
