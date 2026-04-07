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

ActiveRecord::Schema[7.2].define(version: 2026_03_27_000003) do
  create_table "customers", id: :string, force: :cascade do |t|
    t.string "name", limit: 100, null: false
    t.string "email", limit: 255, null: false
    t.string "phone", limit: 20
    t.string "license_number", limit: 50, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "reservations", id: :string, force: :cascade do |t|
    t.string "customer_id", null: false
    t.string "vehicle_id", null: false
    t.date "start_date", null: false
    t.date "end_date", null: false
    t.string "status", limit: 20, default: "pending", null: false
    t.decimal "total_price", precision: 10, scale: 2
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "vehicles", id: :string, force: :cascade do |t|
    t.string "make", limit: 50, null: false
    t.string "model", limit: 50, null: false
    t.integer "year", null: false
    t.string "color", limit: 30
    t.string "license_plate", limit: 20, null: false
    t.decimal "daily_rate", precision: 10, scale: 2, null: false
    t.string "status", limit: 20, default: "available", null: false
    t.integer "mileage", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end
end
