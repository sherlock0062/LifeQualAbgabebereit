let map, directionsService, directionsRenderer;

// Remove global variables since we'll fetch data on demand
// let haltestellenData = null; 
// let crimeData = null;
// let rentPrices = null;

window.addEventListener('DOMContentLoaded', () => {
    console.log("Application loaded");
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
        const response = await fetch(`http://localhost:3000/api/parks?lat=${latLng.lat}&lng=${latLng.lng}&radius=1000`);
        const parks = await response.json();
        
        let closestDistance = Infinity;
        let closestParkName = "Unbekannt";

        parks.forEach(park => {
            const [lon, lat] = park.coordinates.split(',').map(Number);
            const parkLatLng = new google.maps.LatLng(lat, lon);
            const dist = google.maps.geometry.spherical.computeDistanceBetween(latLng, parkLatLng);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestParkName = park.name || "Unbekannt";
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
        const response = await fetch(`http://localhost:3000/api/transport-stops?lat=${latLng.lat}&lng=${latLng.lng}&radius=500`);
        const stops = await response.json();
        return Math.min(stops.length * 10, 100);
    } catch (error) {
        console.log("Failed to calculate transport score:", error);
        return 50;
    }
}

async function getHealthScore(latLng) {
    try {
        const response = await fetch(`http://localhost:3000/api/hospitals?lat=${latLng.lat}&lng=${latLng.lng}&radius=8000`);
        const hospitals = await response.json();
        
        let closestDistance = Infinity;

        hospitals.forEach(hospital => {
            const [lon, lat] = hospital.coordinates.split(',').map(Number);
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
        const response = await fetch(`http://localhost:3000/api/crime-stats/${encodeURIComponent(districtName)}`);
        const data = await response.json();
        
        if (data.error) return 50;

        // Get all crime stats to calculate min/max
        const allStatsResponse = await fetch('http://localhost:3000/api/crime-stats');
        const allStats = await allStatsResponse.json();
        
        const maxCrime = Math.max(...allStats.map(d => d.crimes));
        const minCrime = Math.min(...allStats.map(d => d.crimes));

        const normalized = 1 - ((data.crimes - minCrime) / (maxCrime - minCrime));
        return Math.round(normalized * 100);
    } catch (error) {
        console.warn("Crime score fallback:", error);
        return 50;
    }
}

async function getEducationScore(latLng) {
    try {
        const response = await fetch(`http://localhost:3000/api/schools?lat=${latLng.lat}&lng=${latLng.lng}&radius=3000`);
        const schools = await response.json();
        
        let closestDistance = Infinity;

        schools.forEach(school => {
            const [lon, lat] = school.coordinates.split(',').map(Number);
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
    try {
        const response = await fetch(`http://localhost:3000/api/rent-prices/${encodeURIComponent(district)}`);
        const data = await response.json();
        
        if (data.error) return 50;

        // Get all rent prices to calculate min/max
        const allPricesResponse = await fetch('http://localhost:3000/api/rent-prices');
        const allPrices = await allPricesResponse.json();
        
        const maxPrice = Math.max(...allPrices.map(p => p.price_per_sqm));
        const minPrice = Math.min(...allPrices.map(p => p.price_per_sqm));

        const normalized = 1 - ((data.price_per_sqm - minPrice) / (maxPrice - minPrice));
        return Math.round(normalized * 100);
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


