class CreateVets < ActiveRecord::Migration[7.2]
  def change
    create_table :vets, id: :uuid do |t|
      t.string :name, limit: 30
      t.uuid :owner_id

      t.timestamps
    end
  end
end
