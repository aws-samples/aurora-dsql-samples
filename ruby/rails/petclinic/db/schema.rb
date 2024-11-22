# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.2].define(version: 2024_11_07_085734) do
  create_schema "sys"

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "owner", primary_key: ["id", "name", "city", "telephone"], force: :cascade do |t|
    t.uuid "id", default: -> { "gen_random_uuid()" }, null: false
    t.string "name", limit: 30, null: false
    t.string "city", limit: 80, null: false
    t.string "telephone", limit: 20
  end

  create_table "owners", primary_key: ["id", "name", "city", "telephone", "created_at", "updated_at"], force: :cascade do |t|
    t.uuid "id", default: -> { "gen_random_uuid()" }, null: false
    t.string "name", limit: 30
    t.string "city", limit: 80
    t.string "telephone", limit: 20
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "pets", primary_key: ["id", "name", "birth_date", "owner_id", "created_at", "updated_at"], force: :cascade do |t|
    t.uuid "id", default: -> { "gen_random_uuid()" }, null: false
    t.string "name", limit: 30
    t.date "birth_date"
    t.uuid "owner_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "specialties", primary_key: ["id", "name", "created_at", "updated_at"], force: :cascade do |t|
    t.uuid "id", default: -> { "gen_random_uuid()" }, null: false
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "vet_specialties", primary_key: ["id", "vet_id", "specialty_id", "created_at", "updated_at"], force: :cascade do |t|
    t.uuid "id", default: -> { "gen_random_uuid()" }, null: false
    t.uuid "vet_id"
    t.uuid "specialty_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "vets", primary_key: ["id", "name", "owner_id", "created_at", "updated_at"], force: :cascade do |t|
    t.uuid "id", default: -> { "gen_random_uuid()" }, null: false
    t.string "name", limit: 30
    t.uuid "owner_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end
end
