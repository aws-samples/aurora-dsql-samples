class VetsController < ApplicationController
  def index
    @vets = Vet.all
  end

  def show
    @vet = Vet.find(params[:id])
  end

  def new
    @vet = Vet.new
  end

  def create
    @vet = Vet.new(vet_params)

    if @vet.save
      redirect_to @vet
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    @vet = Vet.find(params[:id])
  end

  def update
    @vet = Vet.find(params[:id])

    if @vet.update(vet_params)
      redirect_to @vet
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @vet = Vet.find(params[:id])
    @vet.destroy

    redirect_to root_path, status: :see_other
  end

  private
    def vet_params
      params.require(:vet).permit(:name)
    end
end
