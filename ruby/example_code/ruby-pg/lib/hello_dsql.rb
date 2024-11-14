require_relative 'connection_util.rb'
require 'securerandom'

def create_tables(conn)
  conn.exec('CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )')
end

def create_owner(conn)
  conn.exec_params('INSERT INTO owner(id, name, city, telephone) VALUES($1, $2, $3, $4)', [SecureRandom.uuid, 'John Doe', 'Las Vegas', '555-555-5555'])
end

def read_owner(conn)
  pg_result = conn.exec('SELECT * FROM owner')
  pg_result.each do |row|
    puts row
  end
end

def update_owner(conn)
  conn.exec('UPDATE owner SET telephone = $1 WHERE name = $2', ['888-888-8888', 'John Doe'])
end

def delete_owner(conn)
  conn.exec_params('DELETE FROM owner WHERE name = $1', ['John Doe'])
end

cluster_endpoint = "siabtthuahe5btniuym7ohbd7u.c0001.us-east-1.prod.sql.axdb.aws.dev"
region = "us-east-1"

begin
  pg_connection = ConnectionUtil.get_connection(cluster_endpoint, region)
  create_tables(pg_connection)
  create_owner(pg_connection)
  read_owner(pg_connection)
  update_owner(pg_connection)
  read_owner(pg_connection)
  delete_owner(pg_connection)
rescue => error
  puts error.full_message
ensure
  unless pg_connection.nil?
    pg_connection.finish()
  end
end
