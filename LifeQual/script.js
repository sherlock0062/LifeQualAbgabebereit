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
        // Convert Google Maps LatLng object to plain coordinates
        const lat = latLng.lat();
        const lng = latLng.lng();
        
        //console.log('Searching for parks near:', { lat, lng });
        const response = await fetch(`http://localhost:3000/api/parks?lat=${lat}&lng=${lng}&radius=2000`);
        const parks = await response.json();
        //console.log('Found parks:', parks);
        
        let closestDistance = Infinity;
        let closestParkName = "Kein Park in der Nähe gefunden";

        if (parks && parks.length > 0) {
            parks.forEach(park => {
                // Parse coordinates from format "(longitude, latitude)"
                const coordsMatch = park.coordinates.match(/\(([^,]+),\s*([^)]+)\)/);
                if (coordsMatch) {
                    const lon = parseFloat(coordsMatch[1]);
                    const lat = parseFloat(coordsMatch[2]);
                    const parkLatLng = new google.maps.LatLng(lat, lon);
                    const dist = google.maps.geometry.spherical.computeDistanceBetween(latLng, parkLatLng);
                    //console.log(`Park ${park.name} is ${dist.toFixed(2)}m away`);
                    if (dist < closestDistance) {
                        closestDistance = dist;
                        closestParkName = park.name || "Unbenannter Park";
                    }
                }
            });
        }

        return {
            score: closestDistance < 100 ? 100 :
                   closestDistance < 300 ? 80 :
                   closestDistance < 500 ? 60 :
                   closestDistance < 1000 ? 40 : 20,
            closestParkName: closestParkName
        };
    } catch (error) {
        console.error("Failed to calculate park score:", error);
        return {
            score: 50,
            closestParkName: "Fehler bei der Park-Suche"
        };
    }
}

async function getTransportScore(latLng) {
    try {
        const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
        const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;

        console.log('Searching for stops near:', { lat, lng });

        const RADIUS_METERS = 500;

        const response = await fetch(
            `http://localhost:3000/api/transport-stops?lat=${lat}&lng=${lng}&radius=500`
        );

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const stops = await response.json();
        console.log('Found stops:', stops);

        let nearbyCount = 0;

        stops.forEach(stop => {
            const coords = stop.coordinates;

            if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') {
                console.warn('Invalid coordinates for stop:', stop);
                return;
            }

            const stopLat = coords.y; // y = Breitengrad (lat)
            const stopLng = coords.x; // x = Längengrad (lng)

            const stopLatLng = new google.maps.LatLng(stopLat, stopLng);
            const originLatLng = new google.maps.LatLng(lat, lng);

            const distance = google.maps.geometry.spherical.computeDistanceBetween(
                originLatLng,
                stopLatLng
            );

            console.log(`Stop ${stop.properties?.BEZEICHNUNG || 'unnamed'} is ${distance.toFixed(2)}m away`);

            if (distance <= RADIUS_METERS) {
                nearbyCount++;
            }
        });

        const score = Math.min(nearbyCount * 10, 100);
        console.log(`Transport score: ${score} (${nearbyCount} stops within ${RADIUS_METERS}m)`);
        return score;
    } catch (error) {
        console.error("Failed to calculate transport score:", error);
        return 50;
    }
}

async function getHealthScore(latLng) {
    try {

        const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
        const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;

        const response = await fetch(`http://localhost:3000/api/hospitals?lat=${lat}&lng=${lng}&radius=8000`);
        const hospitals = await response.json();

        console.log('Hospitals response:', hospitals);
        if (!Array.isArray(hospitals)) {
            console.warn('Hospitals ist kein Array, benutze hospitals.data oder andere Struktur.');
            return 50; // Fallback-Score
        }

        let closestDistance = Infinity;

        hospitals.forEach(hospital => {
            const lon = hospital.coordinates.x;
            const lat = hospital.coordinates.y;
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
            // Sicherstellen, dass Koordinaten vorhanden und korrekt sind
            if (!school.coordinates || typeof school.coordinates.x !== 'number' || typeof school.coordinates.y !== 'number') {
                return; // überspringen, falls ungültige Koordinaten
            }

            const lon = school.coordinates.x;
            const lat = school.coordinates.y;

            const schoolLatLng = new google.maps.LatLng(lat, lon);
            const distance = google.maps.geometry.spherical.computeDistanceBetween(latLng, schoolLatLng);

            if (distance < closestDistance) {
                closestDistance = distance;
            }
        });

        // Punktevergabe je nach Entfernung zur nächsten Schule
        if (closestDistance < 100) return 100;
        if (closestDistance < 300) return 80;
        if (closestDistance < 500) return 60;
        if (closestDistance < 1000) return 40;
        return 20;

    } catch (error) {
        console.error("Failed to calculate education score:", error);
        return 50; // Fallback-Wert bei Fehler
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

async function getDistrictFromLatLng(latLng) {
    try {
        const geocoder = new google.maps.Geocoder();
        const response = await new Promise((resolve, reject) => {
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === "OK" && results.length > 0) {
                    resolve(results[0]);
                } else {
                    reject(new Error("Geocoding failed or returned no results: " + status));
                }
            });
        });

        console.log("Geocoding response:", response);

        const addressComponents = response.address_components;
        for (const component of addressComponents) {
            if (
                component.types.includes("administrative_area_level_3") ||
                component.types.includes("sublocality_level_1") ||
                component.types.includes("postal_code")
            ) {
                console.log("Matched component:", component);
                return component.long_name;
            }
        }

        const formattedAddress = response.formatted_address;
        const districtMatch = formattedAddress.match(/(\d{1,2})\.\s?Bezirk/i);
        if (districtMatch) {
            return `${districtMatch[1]}. Bezirk`;
        }

        const postalMatch = formattedAddress.match(/\b10(\d)\b/);
        if (postalMatch) {
            return `${postalMatch[1]}. Bezirk`;
        }

        throw new Error("Could not determine district");
    } catch (error) {
        console.error("Error getting district:", error, "for latLng:", latLng);
        return "1. Bezirk"; // Fallback
    }
}


async function getCityData(address) {
    const gLatLng = await geocodeAddress(address);
    if (!gLatLng || typeof gLatLng.lat !== 'function' || typeof gLatLng.lng !== 'function') {
        throw new Error("Invalid geocoded LatLng object");
    }

    // Convert to plain object for custom scoring functions
    const latLng = {
        lat: gLatLng.lat(),
        lng: gLatLng.lng()
    };
    
    const district = await getDistrictFromLatLng(gLatLng);

    const [transportScore, parkData, healthScore, safetyScore, educationScore, costOfLivingScore] = await Promise.all([
        getTransportScore(latLng),      
        getGreenAreaScore(gLatLng),      
        getHealthScore(gLatLng),
        getSafetyScoreFromDistrict(district),
        getEducationScore(latLng),
        getCostOfLivingScore(district)
    ]);

    return {
        latLng,               // lat/lng for future use
        transportScore,
        parkScore: parkData.score,
        closestParkName: parkData.closestParkName,
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

        // Update comparison elements
        document.getElementById('qol1').textContent = `Quality of Life für Adresse1: ${qol1.totalScore}`;
        document.getElementById('qol2').textContent = `Quality of Life für Adresse2: ${qol2.totalScore}`;
        document.getElementById('qolDifference').textContent = `QoL-Differenz: ${Math.abs(qol1.totalScore - qol2.totalScore)}`;

        // Update Address 1 results
        document.getElementById('qolTotal1').textContent = qol1.totalScore;
        document.getElementById('qolHealth1').textContent = qol1.health;
        document.getElementById('qolTransport1').textContent = qol1.transport;
        document.getElementById('qolParks1').textContent = qol1.parks;
        document.getElementById('closestPark1').textContent = qol1.closestPark;
        document.getElementById('qolEducation1').textContent = qol1.education;
        document.getElementById('qolSafety1').textContent = qol1.safety;
        document.getElementById('qolCost1').textContent = qol1.costOfLiving;

        // Update Address 2 results
        document.getElementById('qolTotal2').textContent = qol2.totalScore;
        document.getElementById('qolHealth2').textContent = qol2.health;
        document.getElementById('qolTransport2').textContent = qol2.transport;
        document.getElementById('qolParks2').textContent = qol2.parks;
        document.getElementById('closestPark2').textContent = qol2.closestPark;
        document.getElementById('qolEducation2').textContent = qol2.education;
        document.getElementById('qolSafety2').textContent = qol2.safety;
        document.getElementById('qolCost2').textContent = qol2.costOfLiving;

        // Show the results container
        document.getElementById('results').style.display = 'block';
        document.getElementById('result').style.display = 'block';

        // Update weightings for Address 1
        const weightList1 = document.getElementById('weightList1');
        weightList1.innerHTML = '';
        
        const weights1 = {
            'Health': qol1.weights.health,
            'Transport': qol1.weights.transport,
            'Green Area': qol1.weights.parks,
            'Education': qol1.weights.education,
            'Safety': qol1.weights.safety,
            'Cost of Living': qol1.weights.costOfLiving
        };

        for (const [category, weight] of Object.entries(weights1)) {
            const li = document.createElement('li');
            li.textContent = `${category}: ${weight}%`;
            weightList1.appendChild(li);
        }

        // Update weightings for Address 2
        const weightList2 = document.getElementById('weightList2');
        weightList2.innerHTML = '';
        
        const weights2 = {
            'Health': qol2.weights.health,
            'Transport': qol2.weights.transport,
            'Green Area': qol2.weights.parks,
            'Education': qol2.weights.education,
            'Safety': qol2.weights.safety,
            'Cost of Living': qol2.weights.costOfLiving
        };

        for (const [category, weight] of Object.entries(weights2)) {
            const li = document.createElement('li');
            li.textContent = `${category}: ${weight}%`;
            weightList2.appendChild(li);
        }

    } catch (error) {
        console.error("Error calculating QoL:", error);
    }
}

async function computeQoL(data, situation) {
    const weights = {
        student:     { transport: 0.25, parks: 0.10, health: 0.10, safety: 0.10, education: 0.30, costOfLiving: 0.15 }, 
        parent:      { transport: 0.15, parks: 0.15, health: 0.20, safety: 0.20, education: 0.25, costOfLiving: 0.05 },
        senior:      { transport: 0.10, parks: 0.20, health: 0.30, safety: 0.30, education: 0.05, costOfLiving: 0.05 },
        unemployed:  { transport: 0.25, parks: 0.05, health: 0.15, safety: 0.10, education: 0.10, costOfLiving: 0.35 },
        default:     { transport: 0.15, parks: 0.15, health: 0.20, safety: 0.20, education: 0.15, costOfLiving: 0.15 }
    };

    const w = weights[situation] || weights.default;

    const totalScore = Math.round(
        data.transportScore * w.transport +
        data.parkScore * w.parks +
        data.healthScore * w.health +
        data.safetyScore * w.safety +
        data.educationScore * w.education +
        data.costOfLivingScore * w.costOfLiving
    );

    return {
        totalScore,
        health: data.healthScore,
        transport: data.transportScore,
        parks: data.parkScore,
        closestPark: data.closestParkName,
        education: data.educationScore,
        safety: data.safetyScore,
        costOfLiving: data.costOfLivingScore,
        weights: {
            health: Math.round(w.health * 100),
            transport: Math.round(w.transport * 100),
            parks: Math.round(w.parks * 100),
            education: Math.round(w.education * 100),
            safety: Math.round(w.safety * 100),
            costOfLiving: Math.round(w.costOfLiving * 100)
        }
    };
}

async function downloadQoLPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);
    
    // Title
    doc.setFontSize(20);
    doc.text('Quality of Life Report', pageWidth/2, 20, { align: 'center' });
    
    // Address 1 Report
    doc.setFontSize(16);
    doc.text('Quality of Life Report zu Adresse1:', margin, 40);
    doc.setFontSize(12);
    
    const address1Data = [
        `Total Score: ${document.getElementById('qolTotal1').textContent}/100`,
        `Health: ${document.getElementById('qolHealth1').textContent}`,
        `Transport: ${document.getElementById('qolTransport1').textContent}`,
        `Green Area: ${document.getElementById('qolParks1').textContent} (closest: ${document.getElementById('closestPark1').textContent})`,
        `Education: ${document.getElementById('qolEducation1').textContent}`,
        `Safety: ${document.getElementById('qolSafety1').textContent}`,
        `Cost of Living: ${document.getElementById('qolCost1').textContent}`
    ];
    
    let y = 50;
    address1Data.forEach(line => {
        if (y > 250) { // Check if we need a new page
            doc.addPage();
            y = 20;
        }
        doc.text(line, margin, y);
        y += 10;
    });

    // Address 1 Weightings
    if (y > 230) { // Check if we need a new page for weightings
        doc.addPage();
        y = 20;
    }
    doc.setFontSize(14);
    doc.text('Gewichtungen für Adresse1:', margin, y + 10);
    doc.setFontSize(12);
    y += 20;
    
    const weightItems1 = document.getElementById('weightList1').getElementsByTagName('li');
    for (let item of weightItems1) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        doc.text(item.textContent, margin, y);
        y += 10;
    }
    
    // Add a page break before Address 2
    doc.addPage();
    
    // Address 2 Report
    doc.setFontSize(16);
    doc.text('Quality of Life Report zu Adresse2:', margin, 20);
    doc.setFontSize(12);
    y = 30;
    
    const address2Data = [
        `Total Score: ${document.getElementById('qolTotal2').textContent}/100`,
        `Health: ${document.getElementById('qolHealth2').textContent}`,
        `Transport: ${document.getElementById('qolTransport2').textContent}`,
        `Green Area: ${document.getElementById('qolParks2').textContent} (closest: ${document.getElementById('closestPark2').textContent})`,
        `Education: ${document.getElementById('qolEducation2').textContent}`,
        `Safety: ${document.getElementById('qolSafety2').textContent}`,
        `Cost of Living: ${document.getElementById('qolCost2').textContent}`
    ];
    
    address2Data.forEach(line => {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        doc.text(line, margin, y);
        y += 10;
    });

    // Address 2 Weightings
    if (y > 230) {
        doc.addPage();
        y = 20;
    }
    doc.setFontSize(14);
    doc.text('Gewichtungen für Adresse2:', margin, y + 10);
    doc.setFontSize(12);
    y += 20;
    
    const weightItems2 = document.getElementById('weightList2').getElementsByTagName('li');
    for (let item of weightItems2) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        doc.text(item.textContent, margin, y);
        y += 10;
    }
    
    // Add page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.height - 10);
    }
    
    doc.save('quality-of-life-report.pdf');
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


