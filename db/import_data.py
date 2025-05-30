import json
import psycopg2
from psycopg2.extras import Json
import os

# Database connection parameters
DB_PARAMS = {
    'dbname': 'LifeQual_DB',
    'user': 'user',
    'password': 'password',
    'host': 'localhost',
    'port': '5432'
}

def connect_db():
    return psycopg2.connect(**DB_PARAMS)

def import_transport_stops(conn, json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cur = conn.cursor()
    for feature in data['features']:
        coords = feature['geometry']['coordinates']
        cur.execute("""
            INSERT INTO transport_stops (name, coordinates, properties)
            VALUES (%s, POINT(%s, %s), %s)
        """, (
            feature['properties'].get('name', ''),
            coords[0],  # longitude
            coords[1],  # latitude
            Json(feature['properties'])
        ))
    conn.commit()

def import_parks(conn, json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cur = conn.cursor()
    for feature in data['features']:
        geom = feature['geometry']
        if geom['type'] == 'Point':
            coords = geom['coordinates']
            cur.execute("""
                INSERT INTO parks (name, coordinates, properties)
                VALUES (%s, POINT(%s, %s), %s)
            """, (
                feature['properties'].get('ANL_NAME', ''),
                coords[0],
                coords[1],
                Json(feature['properties'])
            ))
        elif geom['type'] in ['Polygon', 'MultiPolygon']:
            # For polygons, we'll store the first point as coordinates
            coords = geom['coordinates'][0][0] if geom['type'] == 'Polygon' else geom['coordinates'][0][0][0]
            cur.execute("""
                INSERT INTO parks (name, coordinates, polygon_coordinates, properties)
                VALUES (%s, POINT(%s, %s), %s, %s)
            """, (
                feature['properties'].get('ANL_NAME', ''),
                coords[0],
                coords[1],
                Json(geom['coordinates']),
                Json(feature['properties'])
            ))
    conn.commit()

def import_hospitals(conn, json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cur = conn.cursor()
    for feature in data['features']:
        coords = feature['geometry']['coordinates']
        cur.execute("""
            INSERT INTO hospitals (name, coordinates, properties)
            VALUES (%s, POINT(%s, %s), %s)
        """, (
            feature['properties'].get('name', ''),
            coords[0],
            coords[1],
            Json(feature['properties'])
        ))
    conn.commit()

def import_crime_stats(conn, json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cur = conn.cursor()
    for entry in data:
        cur.execute("""
            INSERT INTO crime_stats (district, crimes, year)
            VALUES (%s, %s, %s)
        """, (
            entry['district'],
            entry['crimes'],
            entry.get('year', 2024)
        ))
    conn.commit()

def import_schools(conn, json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cur = conn.cursor()
    for feature in data['features']:
        coords = feature['geometry']['coordinates']
        cur.execute("""
            INSERT INTO schools (name, coordinates, properties)
            VALUES (%s, POINT(%s, %s), %s)
        """, (
            feature['properties'].get('name', ''),
            coords[0],
            coords[1],
            Json(feature['properties'])
        ))
    conn.commit()

def import_rent_prices(conn, json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cur = conn.cursor()
    for district, price in data.items():
        cur.execute("""
            INSERT INTO rent_prices (district, price_per_sqm)
            VALUES (%s, %s)
        """, (district, price))
    conn.commit()

def main():
    conn = connect_db()
    try:
        # Import all data
        import_transport_stops(conn, '../Haltestelle.json')
        import_parks(conn, '../parks.json')
        import_hospitals(conn, '../Krankenhaus.json')
        import_crime_stats(conn, '../crimeStats2024.json')
        import_schools(conn, '../Schulen.json')
        import_rent_prices(conn, '../rentPrices.json')
        print("All data imported successfully!")
    except Exception as e:
        print(f"Error importing data: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    main() 