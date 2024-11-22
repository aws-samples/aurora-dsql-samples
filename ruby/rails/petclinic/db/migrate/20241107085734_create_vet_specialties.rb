class CreateVetSpecialties < ActiveRecord::Migration[7.2]
  def change
    create_table :vet_specialties, id: :uuid do |t|
      t.uuid :vet_id
      t.uuid :specialty_id

      t.timestamps
    end
  end
end
