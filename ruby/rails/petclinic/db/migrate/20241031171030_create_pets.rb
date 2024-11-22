class CreatePets < ActiveRecord::Migration[7.2]
  def change
    create_table :pets, id: :uuid do |t|
      t.string :name, limit: 30
      t.date :birth_date
      t.uuid :owner_id

      t.timestamps
    end
  end
end
