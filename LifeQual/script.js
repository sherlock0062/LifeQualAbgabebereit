let map, directionsService, directionsRenderer;

let haltestellenData = null; 
let crimeData = null;
let rentPrices = null;

window.addEventListener('DOMContentLoaded', () => {
    fetch('Haltestelle.json')
        .then(response => response.json())
        .then(data => {
            haltestellenData = data;
            console.log("Haltestellen loaded:", haltestellenData);
        })
        .catch(error => {
            console.error('Error loading Haltestelle.json:', error);
        });
});

document.getElementById('qlForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const address1 = document.getElementById('address1').value;
    const address2 = document.getElementById('address2').value;
    const situation1 = document.getElementById('situation1').value;
    const situation2 = document.getElementById('situation2').value;

    await calculateQoL(address1, address2, situation1, situation2);
    calculateDistances(address1, address2);
});

function initMap() {
    try {
        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 14,
            center: { lat: 48.2082, lng: 16.3738 }
        });
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer();
        directionsRenderer.setMap(map);
    } catch (e) {
        console.error("Error in initMap():", e);
    }
}

async function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === "OK") {
                resolve(results[0].geometry.location);
                console.log("It worked!");
            } else {
                reject("Geocoding failed: " + status);
            }
        });
    });
}

async function getGreenAreaScore(latLng) {
    try {
        const response = await fetch("parks.json");
        const parks = await response.json();

        let closestDistance = Infinity;
        let closestParkName = "Unbekannt";

        parks.features.forEach(park => {
            const geom = park.geometry;
            if (!geom || !geom.coordinates) return;

            let parkCoord = null;

            if (geom.type === "Polygon") {
                parkCoord = geom.coordinates[0][0];
            } else if (geom.type === "MultiPolygon") {
                parkCoord = geom.coordinates[0][0][0];
            } else if (geom.type === "Point") {
                parkCoord = geom.coordinates;
            }

            if (parkCoord) {
                const [lon, lat] = parkCoord;
                const parkLatLng = new google.maps.LatLng(lat, lon);
                const dist = google.maps.geometry.spherical.computeDistanceBetween(latLng, parkLatLng);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestParkName = park.properties.ANL_NAME || "Unbekannt";
                }
            }
        });

        window.closestParkName = closestParkName;

        if (closestDistance < 100) return 100;
        if (closestDistance < 300) return 80;
        if (closestDistance < 500) return 60;
        if (closestDistance < 1000) return 40;
        return 20;
    } catch (error) {
        console.error("Failed to calculate park score:", error);
        return 50;
    }
}


async function getTransportScore(latLng) {
    try {
        const RADIUS_METERS = 500;

        // Wait for data if it's not loaded yet
        while (!haltestellenData) {
            await new Promise(resolve => setTimeout(resolve, 100));
    }

        let nearbyCount = 0;
        haltestellenData.features.forEach(stop => {
            const [lng, lat] = stop.geometry.coordinates;
            const stopLatLng = new google.maps.LatLng(lat, lng);
            const distance = google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(latLng.lat, latLng.lng),
                stopLatLng
            );
            if (distance <= RADIUS_METERS) {
                nearbyCount++;
            }
        });
        

    return Math.min(nearbyCount * 10, 100);
    } catch (error) {
        console.log("Failed to calculate transport score:");
        return 50;
    }
}

async function getHealthScore(latLng) {
    try {
        const response = await fetch("Krankenhaus.json");
        if (!response.ok) throw new Error("Failed to fetch hospital data");

        const hospitals = await response.json();
        let closestDistance = Infinity;

        hospitals.features.forEach(hospital => {
            const [lon, lat] = hospital.geometry.coordinates;
            const hospitalLatLng = new google.maps.LatLng(lat, lon);
            const distance = google.maps.geometry.spherical.computeDistanceBetween(latLng, hospitalLatLng);
            if (distance < closestDistance) {
                closestDistance = distance;
            }
        });

        if (closestDistance < 500) return 100;
        if (closestDistance < 1000) return 85;
        if (closestDistance < 2000) return 70;
        if (closestDistance < 4000) return 50;
        if (closestDistance < 8000) return 30;
        return 10;

    } catch (error) {
        console.warn("Health score fallback:", error);
        return 50;
    }
}

async function getSafetyScoreFromDistrict(districtName) {
    try {
    // Load JSON once
    if (!crimeData) {
        const response = await fetch("crimeStats2024.json");
        crimeData = await response.json();
    }

    const entry = crimeData.find(d =>
        d.district.toLowerCase() === districtName.toLowerCase()
    );
    if (!entry) return 50;

    const maxCrime = Math.max(...crimeData.map(d => d.crimes));
    const minCrime = Math.min(...crimeData.map(d => d.crimes));

    const normalized = 1 - ((entry.crimes - minCrime) / (maxCrime - minCrime)); // lower crime = higher score
    return Math.round(normalized * 100);
    }catch (error) {
        console.warn("Crime score fallback:", error);
        return 50;
    }
}

async function getDistrictFromLatLng(latLng) {
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: latLng }, (results, status) => {
            if (status === "OK" && results[0]) {
                const districtMatch = results[0].address_components.find(c =>
                    c.types.includes("political") &&
                    c.types.includes("sublocality_level_1")
                );

                if (districtMatch) {
                    resolve(districtMatch.long_name); // e.g., "Favoriten"
                } else {
                    reject("District not found in address components.");
                }
            } else {
                reject("Geocoding failed: " + status);
            }
        });
    });
}

async function calculateSafetyScore(latLng) {
    try {
        const district = await getDistrictFromLatLng(latLng);
        return getSafetyScoreFromDistrict(district);
    } catch (error) {
        console.error("Failed to calculate safety score:", error);
        return 50;
    }
}

async function getEducationScore(latLng) {
    try {
        const response = await fetch("Schulen.json");
        const schools = await response.json();

        let closestDistance = Infinity;

        schools.features.forEach(school => {
            const [lon, lat] = school.geometry.coordinates;
            const schoolLatLng = new google.maps.LatLng(lat, lon);

            const distance = google.maps.geometry.spherical.computeDistanceBetween(latLng, schoolLatLng);
            if (distance < closestDistance) {
                closestDistance = distance;
            }
        });

        if (closestDistance < 300) return 100;
        if (closestDistance < 700) return 80;
        if (closestDistance < 1500) return 60;
        if (closestDistance < 3000) return 40;
        return 20;
    } catch (error) {
        console.error("Failed to calculate education score:", error);
        return 50;
    }
}

async function getCostOfLivingScore(district) {
    if (!rentPrices) {
        const response = await fetch("rentPrices.json");
        rentPrices = await response.json();
    }

    if (!rentPrices[district]) return 50; // fallback if district not found

    const rent = rentPrices[district];
    const rents = Object.values(rentPrices);
    const min = Math.min(...rents);
    const max = Math.max(...rents);

    // Invert: Lower rent = higher score
    const normalized = 1 - (rent - min) / (max - min);
    return Math.round(normalized * 100);
}

async function calculateCostOfLivingScore(latLng) {
    try {
        const district = await getDistrictFromLatLng(latLng);
        return getCostOfLivingScore(district);
    } catch (error) {
        console.error("Cost of living score error:", error);
        return 50;
    }
}

async function getCityData(address) {
    
    const gLatLng = await geocodeAddress(address);
    if (!gLatLng || typeof gLatLng.lat !== 'function' || typeof gLatLng.lng !== 'function') {
        throw new Error("Invalid geocoded LatLng object");
    } 
    // This is a google.maps.LatLng object
 

    // Convert to plain object for custom scoring functions
    const latLng = {
        lat: gLatLng.lat(),
        lng: gLatLng.lng()
    };
    
    const district = await getDistrictFromLatLng(latLng);


    const [transportScore, parkScore, healthScore, safetyScore, educationScore, costOfLivingScore] = await Promise.all([
        getTransportScore(latLng),      
        getGreenAreaScore(gLatLng),      
        getHealthScore(gLatLng),
        calculateSafetyScore(latLng),
        getEducationScore(latLng),
        calculateCostOfLivingScore(latLng)
    ]);

    return {
        latLng,               // lat/lng for future use
        transportScore,
        parkScore,
        healthScore,
        safetyScore,
        educationScore,
        costOfLivingScore
    };
}

async function calculateQoL(address1, address2, situation1, situation2) {
    try {
        const data1 = await getCityData(address1);
        const data2 = await getCityData(address2);

        const qol1 = await computeQoL(data1, situation1);
        const qol2 = await computeQoL(data2, situation2);


        document.getElementById('qol1').innerText = `Quality of Life für Adresse1: ${Math.round(qol1)}`;
        document.getElementById('qol2').innerText = `Quality of Life für Adresse2: ${Math.round(qol2)}`;

        const qolDifference = Math.abs(qol1 - qol2);
        document.getElementById('qolDifference').innerText = `QoL-Differenz: ${Math.round(qolDifference)}`;

        document.getElementById('result').style.display = 'block';
        document.getElementById('nearestPark').innerText = `Nächstgelegener Park zu Adresse2: ${window.closestParkName}`;

    } catch (error) {
        alert("Error calculating QoL: " + error);
        console.error(error);
    }
}

async function computeQoL(data, situation) {
    const weights = {
        student:     { transport: 0.25, park: 0.10, health: 0.10, safety: 0.10, education: 0.30, cost: 0.15 }, 
        // Studenten brauchen Transportation und natürlich Bildung mehr als vieles andere. Sie haben auch den Zweithöchsten costOfLiving Wert.
        parent:      { transport: 0.15, park: 0.15, health: 0.20, safety: 0.20, education: 0.25, cost: 0.05 },
        // Parents wollen eigentlich alles. Safety für ihre Familie, Education für die Kinder, Parks für die Familie, gegebenenfalls auch public transport, damit nicht zwei Autos gekauft werden müssen
        senior:      { transport: 0.10, park: 0.20, health: 0.30, safety: 0.30, education: 0.05, cost: 0.05 },
        //Pensionisten werden nicht mehr zur Schule gehen. Ihre Fokus liegt auf Gesundheit. 
        unemployed:  { transport: 0.25, park: 0.05, health: 0.15, safety: 0.10, education: 0.10, cost: 0.35 },
        // Bei Arbeitslosen ist eventuell auch das Fahrzeug in Gefahr. Cost of Living und Transport werden sehr wichtig. Parks sind vernachlässigbar.
        default:     { transport: 0.15, park: 0.15, health: 0.20, safety: 0.20, education: 0.15, cost: 0.15 }
        // Default case, für zukünfitge Erweiterungen als baseline.
    };

    const w = weights[situation] || weights.default;
    window.qolWeights = w;

    const totalScore = Math.round(
        data.transportScore * w.transport +
        data.parkScore * w.park +
        data.healthScore * w.health +
        data.safetyScore * w.safety +
        data.educationScore * w.education +
        data.costOfLivingScore * w.cost
    );

    renderQoLBreakdown(data, totalScore);
    return totalScore;
}

function renderQoLBreakdown(data, totalScore) {
    document.getElementById("qolTotal").textContent = totalScore;
    document.getElementById("qolHealth").textContent = data.healthScore;
    document.getElementById("qolTransport").textContent = data.transportScore;
    document.getElementById("qolParks").textContent = data.parkScore;
    document.getElementById("qolEducation").textContent = data.educationScore;
    document.getElementById("qolSafety").textContent = data.safetyScore;
    document.getElementById("qolCost").textContent = data.costOfLivingScore;
    document.getElementById("closestPark").textContent = window.closestParkName || "N/A";
    document.getElementById("results").style.display = "block";

    const weightSummary = document.getElementById("weightSummary");
    const list = document.getElementById("weightList");
    list.innerHTML = "";
    
//Das war notwendig, weil sich der Titel immer doppelt generiert hat
const existingHeading = weightSummary.querySelector("strong");
if (existingHeading) existingHeading.remove();

const heading = document.createElement("strong");
heading.textContent = "Gewichtungen:";
weightSummary.prepend(heading);

    
    // Populate weights
    const w = window.qolWeights || {};
    for (const [category, weight] of Object.entries(w)) {
        const li = document.createElement("li");
        li.textContent = `${capitalize(category)}: ${Math.round(weight * 100)}%`;
        list.appendChild(li);
    }
    weightSummary.style.display = "block";
    
}

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}


async function downloadQoLPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const total = document.getElementById("qolTotal").textContent;
    const health = document.getElementById("qolHealth").textContent;
    const transport = document.getElementById("qolTransport").textContent;
    const parks = document.getElementById("qolParks").textContent;
    const education = document.getElementById("qolEducation").textContent;
    const safety = document.getElementById("qolSafety").textContent;
    const cost = document.getElementById("qolCost").textContent;
    const parkName = document.getElementById("closestPark").textContent;

    const lines = [
        "Quality of Life Report",
        "==========================",
        `Total Score: ${total}/100`,
        "",
        `Health: ${health}`,
        `Transport: ${transport}`,
        `Green Area: ${parks}`,
        `Closest park: ${parkName}`,
        `Education: ${education}`,
        `Safety: ${safety}`,
        `Cost of Living: ${cost}`
    ];
    

    lines.forEach((line, i) => {
        doc.text(line, 10, 20 + i * 10);
    });

    const w = window.qolWeights || {};
doc.text("Gewichtungen:", 10, 130);
let y = 140;
Object.entries(w).forEach(([key, val]) => {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    doc.text(`${label}: ${Math.round(val * 100)}%`, 10, y);
    y += 10;
});


    doc.save("quality-of-life-report.pdf");
}

function calculateDistances(address1, address2) {
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ address: address1 }, (results1, status1) => {
        if (status1 === "OK") {
            geocoder.geocode({ address: address2 }, (results2, status2) => {
                if (status2 === "OK") {
                    const latLng1 = results1[0].geometry.location;
                    const latLng2 = results2[0].geometry.location;

                    const linearDistance = google.maps.geometry.spherical.computeDistanceBetween(latLng1, latLng2);
                    document.getElementById('linearDistance').innerText = `Linear Distance: ${Math.round(linearDistance / 1000)} km`;

                    const request = {
                        origin: address1,
                        destination: address2,
                        travelMode: google.maps.TravelMode.DRIVING
                    };

                    directionsService.route(request, (result, status) => {
                        if (status === "OK") {
                            const routeDistance = result.routes[0].legs[0].distance.value;
                            document.getElementById('routeDistance').innerText = `Route Distance: ${Math.round(routeDistance / 1000)} km`;
                            directionsRenderer.setDirections(result);
                        } else {
                            alert("Directions request failed due to " + status);
                        }
                    });
                } else {
                    alert("Geocode failed for Address 2: " + status2);
                }
            });
        } else {
            alert("Geocode failed for Address 1: " + status1);
        }
    });
}


