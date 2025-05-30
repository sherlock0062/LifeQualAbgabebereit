-- Create tables for our data

-- Transport stops (Haltestellen)
CREATE TABLE IF NOT EXISTS transport_stops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    coordinates POINT,
    properties JSONB
);

-- Parks and green areas
CREATE TABLE IF NOT EXISTS parks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    coordinates POINT,
    polygon_coordinates POLYGON,
    properties JSONB
);

-- Hospitals
CREATE TABLE IF NOT EXISTS hospitals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    coordinates POINT,
    properties JSONB
);

-- Crime statistics by district
CREATE TABLE IF NOT EXISTS crime_stats (
    id SERIAL PRIMARY KEY,
    district VARCHAR(255) UNIQUE,
    crimes INTEGER,
    year INTEGER
);

-- Schools
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    coordinates POINT,
    properties JSONB
);

-- Rent prices by district
CREATE TABLE IF NOT EXISTS rent_prices (
    id SERIAL PRIMARY KEY,
    district VARCHAR(255) UNIQUE,
    price_per_sqm DECIMAL(10,2)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transport_stops_coordinates ON transport_stops USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_parks_coordinates ON parks USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_hospitals_coordinates ON hospitals USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_schools_coordinates ON schools USING GIST (coordinates); 