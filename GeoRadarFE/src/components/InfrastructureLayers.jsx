import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from './Globe';

/* ═══════════════════════════════════════════════════════
   Infrastructure Layers — 8 static GeoJSON overlays
   
   nuclear    ☢️  — Reactor sites
   military   🪖  — Military bases
   notams     📡  — NOTAM zones
   chokepoints🚧  — Maritime chokepoints
   pipelines  🛢️  — Oil & gas pipelines
   cables     🌐  — Submarine internet cables
   datacenters🖥️  — Hyperscaler data centres
   launch     🚀  — Rocket launch sites
   ═══════════════════════════════════════════════════════ */

/* ─────── Default active layers (must match GlobeLayersPanel) ─────── */
const DEFAULT_ACTIVE = ['aviation', 'marine', 'conflict', 'military', 'nuclear', 'notams', 'chokepoints'];

/* ─────── Layer Definitions with real-world data ─────── */
const LAYER_DEFS = {
    nuclear: {
        emoji: '☢️',
        color: '#fbbf24',
        glowColor: 'rgba(251,191,36,0.15)',
        label: 'NUCLEAR SITE',
        type: 'point',
        data: [
            { name: 'Zaporizhzhia NPP', country: 'Ukraine', lat: 47.507, lng: 34.585, status: 'Occupied', type: 'VVER-1000', capacity: '5700 MW', reactors: 6, note: 'Largest nuclear plant in Europe, under Russian military control' },
            { name: 'Bushehr NPP', country: 'Iran', lat: 28.833, lng: 50.889, status: 'Operational', type: 'VVER-1000', capacity: '1000 MW', reactors: 1, note: 'Iran\'s only nuclear power station' },
            { name: 'Natanz Enrichment', country: 'Iran', lat: 33.724, lng: 51.727, status: 'Active', type: 'Enrichment Facility', capacity: 'Classified', reactors: 0, note: 'Underground uranium enrichment complex' },
            { name: 'Yongbyon Complex', country: 'North Korea', lat: 39.796, lng: 125.755, status: 'Active', type: 'Research/Weapons', capacity: '5 MWe', reactors: 1, note: 'Primary weapons-grade plutonium production site' },
            { name: 'Dimona Research Center', country: 'Israel', lat: 31.001, lng: 35.145, status: 'Active', type: 'Research', capacity: 'Classified', reactors: 1, note: 'Israeli nuclear weapons program site' },
            { name: 'Kudankulam NPP', country: 'India', lat: 8.168, lng: 77.711, status: 'Operational', type: 'VVER-1000', capacity: '2000 MW', reactors: 2, note: 'India\'s largest nuclear power plant' },
            { name: 'Taishan NPP', country: 'China', lat: 21.914, lng: 112.981, status: 'Operational', type: 'EPR-1750', capacity: '3460 MW', reactors: 2, note: 'World\'s first EPR reactor to reach full power' },
            { name: 'Hinkley Point C', country: 'UK', lat: 51.208, lng: -3.131, status: 'Under Construction', type: 'EPR-1600', capacity: '3260 MW', reactors: 2, note: 'First new UK nuclear plant in a generation' },
            { name: 'Bruce Power', country: 'Canada', lat: 44.327, lng: -81.601, status: 'Operational', type: 'CANDU', capacity: '6232 MW', reactors: 8, note: 'World\'s largest operational nuclear facility' },
            { name: 'Palo Verde', country: 'USA', lat: 33.388, lng: -112.862, status: 'Operational', type: 'PWR', capacity: '3937 MW', reactors: 3, note: 'Largest nuclear plant in the US' },
            { name: 'Barakah NPP', country: 'UAE', lat: 23.961, lng: 52.257, status: 'Operational', type: 'APR-1400', capacity: '5600 MW', reactors: 4, note: 'Arab world\'s first nuclear power station' },
            { name: 'Akkuyu NPP', country: 'Turkey', lat: 36.147, lng: 33.537, status: 'Under Construction', type: 'VVER-1200', capacity: '4800 MW', reactors: 4, note: 'Turkey\'s first nuclear power plant' },
            { name: 'Rooppur NPP', country: 'Bangladesh', lat: 24.064, lng: 89.048, status: 'Under Construction', type: 'VVER-1200', capacity: '2400 MW', reactors: 2, note: 'Bangladesh\'s first nuclear power plant' },
            { name: 'Fukushima Daiichi', country: 'Japan', lat: 37.421, lng: 141.033, status: 'Decommissioning', type: 'BWR', capacity: '0 MW', reactors: 6, note: 'Site of 2011 nuclear disaster, ongoing water release' },
            { name: 'Chernobyl', country: 'Ukraine', lat: 51.389, lng: 30.099, status: 'Exclusion Zone', type: 'RBMK-1000', capacity: '0 MW', reactors: 4, note: 'Site of 1986 disaster, briefly seized by Russian forces 2022' },
        ],
    },
    military: {
        emoji: '🪖',
        color: '#ef4444',
        glowColor: 'rgba(239,68,68,0.15)',
        label: 'MILITARY BASE',
        type: 'point',
        data: [
            { name: 'Camp Lemonnier', country: 'Djibouti', lat: 11.547, lng: 43.151, status: 'Active', branch: 'US Navy / AFRICOM', type: 'Combined', personnel: '~4,000', note: 'Primary US base in Africa, counter-terror operations' },
            { name: 'Al Udeid Air Base', country: 'Qatar', lat: 25.118, lng: 51.315, status: 'Active', branch: 'USAF / CENTCOM', type: 'Air Base', personnel: '~11,000', note: 'Largest US air base in the Middle East' },
            { name: 'Diego Garcia', country: 'British Indian Ocean', lat: -7.313, lng: 72.411, status: 'Active', branch: 'US Navy / RAF', type: 'Naval & Air', personnel: '~4,000', note: 'Strategic mid-ocean bomber and naval base' },
            { name: 'Ramstein Air Base', country: 'Germany', lat: 49.437, lng: 7.601, status: 'Active', branch: 'USAF / NATO', type: 'Air Base', personnel: '~9,200', note: 'NATO Allied Air Command headquarters' },
            { name: 'Yokosuka Naval Base', country: 'Japan', lat: 35.283, lng: 139.681, status: 'Active', branch: 'US Navy', type: 'Naval', personnel: '~27,000', note: 'Home port for USS Ronald Reagan carrier group' },
            { name: 'Tartus Naval Facility', country: 'Syria', lat: 34.889, lng: 35.887, status: 'Active', branch: 'Russian Navy', type: 'Naval', personnel: '~1,700', note: 'Russia\'s only Mediterranean naval base' },
            { name: 'Hmeimim Air Base', country: 'Syria', lat: 35.411, lng: 35.949, status: 'Active', branch: 'Russian Air Force', type: 'Air Base', personnel: '~5,000', note: 'Primary Russian air operations base in Syria' },
            { name: 'Jiuquan Launch Center', country: 'China', lat: 40.958, lng: 100.291, status: 'Active', branch: 'PLA Strategic', type: 'Space/Missile', personnel: 'Classified', note: 'China\'s oldest launch site, crewed spaceflight hub' },
            { name: 'Pine Gap', country: 'Australia', lat: -23.799, lng: 133.737, status: 'Active', branch: 'ASD / NSA', type: 'SIGINT', personnel: '~800', note: 'Joint US-Australian satellite surveillance facility' },
            { name: 'Thule Air Base', country: 'Greenland', lat: 76.531, lng: -68.703, status: 'Active', branch: 'US Space Force', type: 'Early Warning', personnel: '~600', note: 'Ballistic missile early-warning radar station' },
            { name: 'Incirlik Air Base', country: 'Turkey', lat: 37.002, lng: 35.426, status: 'Active', branch: 'USAF / Turkish AF', type: 'Air Base', personnel: '~5,000', note: 'Strategic US/NATO air base, houses B61 nuclear weapons' },
            { name: 'Okinawa / Kadena Air Base', country: 'Japan', lat: 26.351, lng: 127.767, status: 'Active', branch: 'USAF', type: 'Air Base', personnel: '~18,000', note: 'Largest US air force base in the Pacific' },
            { name: 'Severomorsk Naval Base', country: 'Russia', lat: 69.073, lng: 33.416, status: 'Active', branch: 'Russian Northern Fleet', type: 'Naval', personnel: '~30,000', note: 'Home base of Russia\'s Northern Fleet & nuclear submarines' },
            { name: 'Bagram Airfield', country: 'Afghanistan', lat: 34.946, lng: 69.265, status: 'Abandoned (2021)', branch: 'Former USAF', type: 'Air Base', personnel: '0', note: 'Abandoned during US withdrawal, now under Taliban' },
        ],
    },
    notams: {
        emoji: '📡',
        color: '#f97316',
        glowColor: 'rgba(249,115,22,0.15)',
        label: 'NOTAM',
        type: 'point',
        data: [
            { name: 'Eastern Mediterranean TFR', country: 'International', lat: 34.8, lng: 33.5, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-UNL', note: 'Temporary flight restriction due to military operations' },
            { name: 'Black Sea NOTAM Zone', country: 'International', lat: 43.5, lng: 34.0, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-FL660', note: 'No-fly zone over Black Sea conflict area' },
            { name: 'North Korea ADIZ', country: 'North Korea', lat: 39.0, lng: 126.0, status: 'Permanent', category: 'Prohibited Area', altitude: 'FL000-UNL', note: 'Permanent no-fly zone over DPRK territory' },
            { name: 'Iranian ADIZ', country: 'Iran', lat: 32.5, lng: 53.5, status: 'Active', category: 'ADIZ', altitude: 'FL000-FL660', note: 'Active defense identification zone' },
            { name: 'Red Sea / Houthi Threat Zone', country: 'Yemen', lat: 14.5, lng: 42.5, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-FL300', note: 'Drone and missile threat to commercial aviation' },
            { name: 'Taiwan Strait ADIZ', country: 'Taiwan', lat: 24.5, lng: 119.0, status: 'Active', category: 'ADIZ', altitude: 'FL000-UNL', note: 'Frequent PLA military aircraft incursions reported' },
            { name: 'Libya TFR', country: 'Libya', lat: 32.0, lng: 13.0, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-UNL', note: 'Active conflict airspace' },
            { name: 'Sahel Region TFR', country: 'Niger/Mali', lat: 16.0, lng: 2.0, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-FL250', note: 'Military operations in Sahel region' },
            { name: 'Gaza Strip TFR', country: 'Palestine', lat: 31.4, lng: 34.4, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-UNL', note: 'Active conflict zone, no civilian flights permitted' },
            { name: 'Sudan TFR', country: 'Sudan', lat: 15.5, lng: 32.5, status: 'Active', category: 'Conflict Zone', altitude: 'FL000-FL350', note: 'Civil conflict flight restriction' },
        ],
    },
    chokepoints: {
        emoji: '🚧',
        color: '#f59e0b',
        glowColor: 'rgba(245,158,11,0.15)',
        label: 'CHOKEPOINT',
        type: 'point',
        data: [
            { name: 'Strait of Hormuz', country: 'Iran/Oman', lat: 26.56, lng: 56.25, status: 'High Traffic', traffic: '~21M bbl/day oil', width: '~33 km', note: 'World\'s most important oil chokepoint — 1/3 of seaborne oil transits here' },
            { name: 'Suez Canal', country: 'Egypt', lat: 30.46, lng: 32.35, status: 'Operational', traffic: '~12% global trade', width: '205 m', note: 'Key shortcut between Mediterranean and Red Sea' },
            { name: 'Strait of Malacca', country: 'Malaysia/Indonesia', lat: 2.50, lng: 101.40, status: 'High Traffic', traffic: '~25% global trade', width: '~65 km', note: 'Shortest sea route between Indian & Pacific oceans' },
            { name: 'Panama Canal', country: 'Panama', lat: 9.10, lng: -79.68, status: 'Drought Restricted', traffic: '~5% global trade', width: '33 m', note: 'Water level restrictions reducing daily transits' },
            { name: 'Bab el-Mandeb', country: 'Yemen/Djibouti', lat: 12.58, lng: 43.33, status: 'Threat Zone', traffic: '~12% global trade', width: '~30 km', note: 'Houthi attacks disrupting Red Sea shipping' },
            { name: 'Turkish Straits (Bosporus)', country: 'Turkey', lat: 41.12, lng: 29.05, status: 'Operational', traffic: '~3M bbl/day oil', width: '~0.7 km', note: 'Only passage from Black Sea to Mediterranean' },
            { name: 'Strait of Gibraltar', country: 'Spain/Morocco', lat: 35.96, lng: -5.50, status: 'Operational', traffic: '~Moderate', width: '~14 km', note: 'Gateway between Atlantic and Mediterranean' },
            { name: 'Danish Straits', country: 'Denmark', lat: 55.35, lng: 11.00, status: 'Operational', traffic: '~3.5M bbl/day', width: '~4 km', note: 'Only passage to the Baltic Sea' },
            { name: 'Cape of Good Hope', country: 'South Africa', lat: -34.35, lng: 18.47, status: 'Alternate Route', traffic: 'Increasing', width: 'Open', note: 'Alternate route due to Red Sea diversions' },
            { name: 'Lombok Strait', country: 'Indonesia', lat: -8.39, lng: 115.72, status: 'Operational', traffic: '~Moderate', width: '~35 km', note: 'Alternate passage for supertankers too deep for Malacca' },
        ],
    },
    pipelines: {
        emoji: '🛢️',
        color: '#a855f7',
        glowColor: 'rgba(168,85,247,0.15)',
        label: 'PIPELINE',
        type: 'line',
        lineData: [
            { name: 'Nord Stream (Damaged)', points: [[12.10, 54.12],[13.50, 55.30],[17.50, 55.80],[19.30, 59.50]], status: 'Sabotaged', type: 'Gas', capacity: '55 bcm/yr', note: 'Undersea gas pipeline sabotaged Sept 2022' },
            { name: 'TurkStream', points: [[28.70, 41.20],[28.90, 42.20],[30.00, 43.50],[31.80, 44.20]], status: 'Operational', type: 'Gas', capacity: '31.5 bcm/yr', note: 'Russian gas to Turkey and SE Europe' },
            { name: 'Druzhba Pipeline', points: [[52.30, 56.10],[40.80, 55.00],[32.00, 52.50],[24.00, 51.80],[17.00, 51.50]], status: 'Operational', type: 'Oil', capacity: '1.2M bbl/day', note: 'World\'s longest oil pipeline network' },
            { name: 'TANAP/TAP', points: [[42.00, 40.15],[40.00, 39.50],[35.00, 39.00],[28.00, 40.50],[20.00, 40.00]], status: 'Operational', type: 'Gas', capacity: '16 bcm/yr', note: 'Azerbaijan gas to Europe via Turkey' },
            { name: 'East-West Pipeline (Petroline)', points: [[38.50, 24.00],[42.20, 24.80],[46.00, 25.50],[50.10, 26.50]], status: 'Operational', type: 'Oil', capacity: '5M bbl/day', note: 'Saudi Arabia cross-country oil pipeline' },
            { name: 'TAPI Pipeline', points: [[62.20, 35.90],[62.00, 33.00],[67.00, 30.50],[69.50, 25.50]], status: 'Under Construction', type: 'Gas', capacity: '33 bcm/yr', note: 'Turkmenistan-Afghanistan-Pakistan-India' },
            { name: 'Keystone XL (Cancelled)', points: [[-110.80, 50.50],[-107.50, 46.50],[-101.00, 42.50],[-97.00, 36.50]], status: 'Cancelled', type: 'Oil', capacity: '830K bbl/day', note: 'Controversial US-Canada oil pipeline' },
            { name: 'Power of Siberia', points: [[128.00, 50.50],[125.50, 48.00],[122.00, 45.50],[115.00, 42.00]], status: 'Operational', type: 'Gas', capacity: '38 bcm/yr', note: 'Russia-China gas pipeline' },
        ],
    },
    cables: {
        emoji: '🌐',
        color: '#06b6d4',
        glowColor: 'rgba(6,182,212,0.15)',
        label: 'SUBMARINE CABLE',
        type: 'line',
        lineData: [
            { name: 'MAREA Cable', points: [[-5.90, 36.00],[-15.00, 40.00],[-30.00, 42.00],[-50.00, 41.50],[-73.90, 39.30]], status: 'Operational', type: 'Fiber', capacity: '200 Tbps', note: 'Microsoft/Facebook transatlantic cable' },
            { name: 'SEA-ME-WE 6', points: [[103.80, 1.30],[80.00, 6.00],[57.00, 21.00],[43.00, 12.50],[32.30, 31.20],[10.00, 36.00],[-5.00, 36.00]], status: 'Under Construction', type: 'Fiber', capacity: '126 Tbps', note: 'Replacement for aging SEA-ME-WE 3' },
            { name: 'PEACE Cable', points: [[121.50, 31.20],[103.80, 1.30],[72.80, 18.90],[57.00, 21.00],[43.00, 12.50],[32.30, 31.20],[15.00, 36.00],[-5.50, 36.00]], status: 'Operational', type: 'Fiber', capacity: '96 Tbps', note: 'Pakistan & East Africa Connecting Europe cable' },
            { name: 'Equiano', points: [[-2.00, 51.50],[-9.00, 38.60],[-17.70, 28.10],[-16.00, 12.00],[-2.00, 6.00],[9.00, 4.00],[12.00, -4.50],[18.50, -33.90]], status: 'Operational', type: 'Fiber', capacity: '144 Tbps', note: 'Google cable connecting Africa to Europe' },
            { name: 'Japan-Guam-Australia South', points: [[140.00, 35.50],[144.80, 13.40],[151.20, -33.80]], status: 'Operational', type: 'Fiber', capacity: '36 Tbps', note: 'JGA South submarine cable' },
            { name: 'AEC-2 (Asia-Europe)', points: [[103.80, 1.30],[72.80, 18.90],[56.30, 25.30],[43.00, 12.50],[32.30, 31.20],[24.00, 35.00]], status: 'Operational', type: 'Fiber', capacity: '24 Tbps', note: 'Key Asia-to-Europe connectivity path' },
        ],
    },
    datacenters: {
        emoji: '🖥️',
        color: '#22c55e',
        glowColor: 'rgba(34,197,94,0.15)',
        label: 'DATA CENTER',
        type: 'point',
        data: [
            { name: 'AWS us-east-1 (N. Virginia)', country: 'USA', lat: 39.043, lng: -77.487, status: 'Operational', operator: 'Amazon AWS', capacity: '~2,000 MW', tier: 'Tier IV', note: 'World\'s largest cloud region by capacity' },
            { name: 'Google The Dalles', country: 'USA', lat: 45.594, lng: -121.179, status: 'Operational', operator: 'Google', capacity: '~600 MW', tier: 'Tier IV', note: 'Google\'s oldest continuously operational data center' },
            { name: 'Microsoft Dublin', country: 'Ireland', lat: 53.336, lng: -6.239, status: 'Operational', operator: 'Microsoft Azure', capacity: '~300 MW', tier: 'Tier IV', note: 'Europe\'s largest Azure region' },
            { name: 'Alibaba Zhangbei', country: 'China', lat: 41.200, lng: 114.700, status: 'Operational', operator: 'Alibaba Cloud', capacity: '~500 MW', tier: 'Tier III', note: 'One of China\'s largest hyperscale facilities' },
            { name: 'Equinix SG3 Singapore', country: 'Singapore', lat: 1.320, lng: 103.820, status: 'Operational', operator: 'Equinix', capacity: '~52 MW', tier: 'Tier IV', note: 'Key APAC interconnection hub' },
            { name: 'AWS eu-west-1 (Frankfurt)', country: 'Germany', lat: 50.110, lng: 8.683, status: 'Operational', operator: 'Amazon AWS', capacity: '~400 MW', tier: 'Tier IV', note: 'Major EU cloud availability zone' },
            { name: 'Google Hamina', country: 'Finland', lat: 60.561, lng: 27.188, status: 'Operational', operator: 'Google', capacity: '~200 MW', tier: 'Tier III', note: 'Sea-water cooled former paper mill' },
            { name: 'Digital Realty NRT (Tokyo)', country: 'Japan', lat: 35.686, lng: 139.702, status: 'Operational', operator: 'Digital Realty', capacity: '~120 MW', tier: 'Tier III', note: 'Major Asian financial data hub' },
            { name: 'AWS ap-south-1 (Mumbai)', country: 'India', lat: 19.076, lng: 72.878, status: 'Operational', operator: 'Amazon AWS', capacity: '~250 MW', tier: 'Tier III', note: 'India\'s primary AWS cloud region' },
            { name: 'Microsoft Quincy', country: 'USA', lat: 47.234, lng: -119.853, status: 'Operational', operator: 'Microsoft Azure', capacity: '~450 MW', tier: 'Tier IV', note: 'One of Microsoft\'s largest US data centers' },
            { name: 'NVIDIA DGX SuperPOD', country: 'USA', lat: 36.175, lng: -115.137, status: 'Operational', operator: 'NVIDIA / Switch', capacity: '~100 MW', tier: 'Tier IV', note: 'AI supercomputing cluster in Las Vegas' },
        ],
    },
    launch: {
        emoji: '🚀',
        color: '#ec4899',
        glowColor: 'rgba(236,72,153,0.15)',
        label: 'LAUNCH SITE',
        type: 'point',
        data: [
            { name: 'Kennedy Space Center LC-39A', country: 'USA', lat: 28.608, lng: -80.604, status: 'Active', operator: 'SpaceX / NASA', type: 'Orbital', launches2024: '~50+', note: 'Primary SpaceX Falcon 9 & Starship pad' },
            { name: 'Cape Canaveral SLC-40', country: 'USA', lat: 28.562, lng: -80.577, status: 'Active', operator: 'SpaceX', type: 'Orbital', launches2024: '~40+', note: 'SpaceX Falcon 9 workhorse pad' },
            { name: 'Vandenberg SLC-4E', country: 'USA', lat: 34.632, lng: -120.611, status: 'Active', operator: 'SpaceX', type: 'Orbital / Polar', launches2024: '~20+', note: 'West coast polar orbit launch site' },
            { name: 'Baikonur Cosmodrome', country: 'Kazakhstan', lat: 45.920, lng: 63.342, status: 'Active', operator: 'Roscosmos', type: 'Orbital', launches2024: '~12', note: 'World\'s first and largest spaceport' },
            { name: 'Jiuquan Satellite Center', country: 'China', lat: 40.958, lng: 100.291, status: 'Active', operator: 'CNSA', type: 'Orbital', launches2024: '~20+', note: 'China\'s primary crewed spaceflight launch site' },
            { name: 'Wenchang Space Center', country: 'China', lat: 19.614, lng: 110.951, status: 'Active', operator: 'CNSA', type: 'Heavy Orbital', launches2024: '~8', note: 'China\'s newest & most modern spaceport' },
            { name: 'Satish Dhawan / Sriharikota', country: 'India', lat: 13.720, lng: 80.230, status: 'Active', operator: 'ISRO', type: 'Orbital', launches2024: '~8', note: 'India\'s primary orbital launch complex' },
            { name: 'Guiana Space Centre', country: 'French Guiana', lat: 5.236, lng: -52.769, status: 'Active', operator: 'ESA / Arianespace', type: 'Orbital', launches2024: '~6', note: 'Europe\'s equatorial launch site for Ariane 6' },
            { name: 'Vostochny Cosmodrome', country: 'Russia', lat: 51.884, lng: 128.334, status: 'Active', operator: 'Roscosmos', type: 'Orbital', launches2024: '~3', note: 'Russia\'s modern replacement for Baikonur' },
            { name: 'Starbase Boca Chica', country: 'USA', lat: 25.997, lng: -97.155, status: 'Active', operator: 'SpaceX', type: 'Super Heavy', launches2024: '~5', note: 'Starship development & launch facility' },
            { name: 'Rocket Lab LC-1', country: 'New Zealand', lat: -39.262, lng: 177.865, status: 'Active', operator: 'Rocket Lab', type: 'Small Orbital', launches2024: '~12+', note: 'Electron rocket launch site on Māhia Peninsula' },
            { name: 'Tanegashima Space Center', country: 'Japan', lat: 30.400, lng: 131.000, status: 'Active', operator: 'JAXA', type: 'Orbital', launches2024: '~4', note: 'Home of Japan\'s H-IIA and H3 rockets' },
        ],
    },
};

/* ─────── Helper: Build GeoJSON ─────── */
function buildPointGeoJSON(items) {
    return {
        type: 'FeatureCollection',
        features: items.map((d, i) => ({
            type: 'Feature',
            id: i,
            geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
            properties: { ...d, _idx: i },
        })),
    };
}

function buildLineGeoJSON(items) {
    return {
        type: 'FeatureCollection',
        features: items.map((d, i) => ({
            type: 'Feature',
            id: i,
            geometry: { type: 'LineString', coordinates: d.points },
            properties: { name: d.name, status: d.status, type: d.type, capacity: d.capacity, note: d.note },
        })),
    };
}

/* ─────── Create emoji canvas icon for map ─────── */
function createEmojiIcon(emoji, bgColor, size = 36) {
    return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        const s = size * 2; // retina
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext('2d');
        const cx = s / 2, cy = s / 2, r = s * 0.40;

        // Outer glow
        const grad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.6);
        grad.addColorStop(0, bgColor.replace('0.15', '0.25'));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);

        // Dark circle background
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fill();
        ctx.strokeStyle = bgColor.replace('0.15', '0.5');
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Emoji text
        ctx.font = `${r * 1.1}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, cx, cy + 1);

        const img = new Image(size, size);
        img.onload = () => resolve(img);
        img.src = canvas.toDataURL();
    });
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */
const InfrastructureLayers = () => {
    const map = useMap();
    const [selectedItem, setSelectedItem] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
    // Initialize visibility: only DEFAULT_ACTIVE layers start visible
    const [visibleLayers, setVisibleLayers] = useState(() => {
        const init = {};
        for (const id of Object.keys(LAYER_DEFS)) {
            init[id] = DEFAULT_ACTIVE.includes(id);
        }
        return init;
    });
    const setupDoneRef = useRef(false);

    const closePopup = useCallback(() => setSelectedItem(null), []);

    /* ── Toggle visibility from GlobeLayersPanel ── */
    useEffect(() => {
        function handleToggle(e) {
            const { layer, active } = e.detail;
            if (LAYER_DEFS[layer]) {
                setVisibleLayers(prev => ({ ...prev, [layer]: active }));
            }
        }
        window.addEventListener('globeLayerToggle', handleToggle);
        return () => window.removeEventListener('globeLayerToggle', handleToggle);
    }, []);

    /* ── Apply visibility ── */
    useEffect(() => {
        if (!map) return;
        for (const [layerId] of Object.entries(LAYER_DEFS)) {
            const vis = visibleLayers[layerId] ? 'visible' : 'none';
            const suffixes = LAYER_DEFS[layerId].type === 'line'
                ? [`${layerId}-lines`, `${layerId}-line-labels`, `${layerId}-endpoints`]
                : [`${layerId}-icons`];
            for (const id of suffixes) {
                try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); } catch {}
            }
        }
        if (selectedItem && visibleLayers[selectedItem.layerId] === false) {
            setSelectedItem(null);
        }
    }, [map, visibleLayers, selectedItem]);

    /* ── Setup all layers ── */
    useEffect(() => {
        if (!map || setupDoneRef.current) return;
        setupDoneRef.current = true;

        async function setup() {
            // Register emoji icons
            for (const [id, def] of Object.entries(LAYER_DEFS)) {
                if (def.type === 'point' || def.type === 'line') {
                    const imgName = `icon-${id}`;
                    if (!map.hasImage(imgName)) {
                        const img = await createEmojiIcon(def.emoji, def.glowColor, 48);
                        map.addImage(imgName, img, { pixelRatio: 2 });
                    }
                }
            }

            // Add point layers
            for (const [id, def] of Object.entries(LAYER_DEFS)) {
                if (def.type === 'point') {
                    const srcId = `${id}-src`;
                    if (!map.getSource(srcId)) {
                        map.addSource(srcId, {
                            type: 'geojson',
                            data: buildPointGeoJSON(def.data),
                        });
                    }

                    const layerName = `${id}-icons`;
                    const initialVis = DEFAULT_ACTIVE.includes(id) ? 'visible' : 'none';
                    if (!map.getLayer(layerName)) {
                        map.addLayer({
                            id: layerName,
                            type: 'symbol',
                            source: srcId,
                            layout: {
                                'icon-image': `icon-${id}`,
                                'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 4, 1.1, 8, 1.4],
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'visibility': initialVis,
                            },
                            paint: {
                                'icon-opacity': 0.9,
                            },
                        });
                    }
                }

                // Line layers (pipelines, cables)
                if (def.type === 'line') {
                    const srcId = `${id}-src`;
                    if (!map.getSource(srcId)) {
                        map.addSource(srcId, {
                            type: 'geojson',
                            data: buildLineGeoJSON(def.lineData),
                        });
                    }

                    // The line itself
                    const lineLayer = `${id}-lines`;
                    const lineVis = DEFAULT_ACTIVE.includes(id) ? 'visible' : 'none';
                    if (!map.getLayer(lineLayer)) {
                        map.addLayer({
                            id: lineLayer,
                            type: 'line',
                            source: srcId,
                            layout: {
                                'line-cap': 'round',
                                'line-join': 'round',
                                'visibility': lineVis,
                            },
                            paint: {
                                'line-color': def.color,
                                'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 5, 2, 10, 3.5],
                                'line-opacity': 0.55,
                                'line-dasharray': id === 'pipelines' ? [4, 2] : [1],
                            },
                        });
                    }

                    // Labels along lines
                    const labelLayer = `${id}-line-labels`;
                    if (!map.getLayer(labelLayer)) {
                        map.addLayer({
                            id: labelLayer,
                            type: 'symbol',
                            source: srcId,
                            minzoom: 4,
                            layout: {
                                'symbol-placement': 'line',
                                'text-field': ['get', 'name'],
                                'text-font': ['Open Sans Regular'],
                                'text-size': 9,
                                'text-max-angle': 30,
                                'text-allow-overlap': false,
                                'visibility': lineVis,
                            },
                            paint: {
                                'text-color': def.color,
                                'text-opacity': 0.6,
                                'text-halo-color': 'rgba(0,0,0,0.7)',
                                'text-halo-width': 1,
                            },
                        });
                    }

                    // Endpoint emoji markers for lines
                    const epPts = [];
                    def.lineData.forEach(item => {
                        // Put an emoji at the midpoint of each line
                        const mid = Math.floor(item.points.length / 2);
                        epPts.push({
                            name: item.name, status: item.status, type: item.type,
                            capacity: item.capacity, note: item.note,
                            lng: item.points[mid][0], lat: item.points[mid][1],
                        });
                    });
                    const epSrcId = `${id}-ep-src`;
                    if (!map.getSource(epSrcId)) {
                        map.addSource(epSrcId, {
                            type: 'geojson',
                            data: buildPointGeoJSON(epPts),
                        });
                    }
                    const epLayerId = `${id}-endpoints`;
                    if (!map.getLayer(epLayerId)) {
                        map.addLayer({
                            id: epLayerId,
                            type: 'symbol',
                            source: epSrcId,
                            layout: {
                                'icon-image': `icon-${id}`,
                                'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 4, 0.9, 8, 1.1],
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true,
                                'visibility': lineVis,
                            },
                            paint: { 'icon-opacity': 0.9 },
                        });
                    }
                }
            }

            /* ── Click handlers ── */
            for (const [id, def] of Object.entries(LAYER_DEFS)) {
                const clickLayers = def.type === 'line'
                    ? [`${id}-endpoints`, `${id}-lines`]
                    : [`${id}-icons`];

                for (const layerName of clickLayers) {
                    map.on('click', layerName, (e) => {
                        if (!e.features?.length) return;
                        const props = e.features[0].properties;
                        const coords = e.lngLat;
                        const pt = map.project([coords.lng, coords.lat]);
                        const rect = map.getContainer().getBoundingClientRect();

                        setPopupPos({
                            x: Math.min(pt.x + 20, rect.width - 300),
                            y: Math.max(pt.y - 100, 20),
                        });
                        setSelectedItem({
                            layerId: id,
                            layerDef: def,
                            props,
                            lngLat: [coords.lng, coords.lat],
                        });
                    });

                    map.on('mouseenter', layerName, () => {
                        map.getCanvas().style.cursor = 'pointer';
                    });
                    map.on('mouseleave', layerName, () => {
                        map.getCanvas().style.cursor = 'crosshair';
                    });
                }
            }
        }

        setup();
    }, [map]);

    /* ─────── Render ─────── */
    const sel = selectedItem;
    const selDef = sel?.layerDef;
    const selColor = selDef?.color || '#fff';

    // Build the popup fields dynamically from properties
    const popupFields = [];
    if (sel) {
        const p = sel.props;
        const skip = ['_idx', 'name', 'note'];
        for (const [k, v] of Object.entries(p)) {
            if (skip.includes(k) || v === undefined || v === null || v === '') continue;
            popupFields.push({ label: k.replace(/([A-Z])/g, ' $1').toUpperCase(), value: String(v) });
        }
    }

    return (
        <div className="infra-layers" style={{ pointerEvents: 'none' }}>
            {/* ── Popup ── */}
            {sel && (
                <div className="infra-popup" style={{
                    left: popupPos.x + 'px',
                    top: popupPos.y + 'px',
                    pointerEvents: 'auto',
                    borderColor: `${selColor}30`,
                }}>
                    <span className="mm-corner tl" style={{ borderColor: `${selColor}60` }} />
                    <span className="mm-corner tr" style={{ borderColor: `${selColor}60` }} />
                    <span className="mm-corner bl" style={{ borderColor: `${selColor}60` }} />
                    <span className="mm-corner br" style={{ borderColor: `${selColor}60` }} />
                    <button className="ip-close" onClick={closePopup}>✕</button>

                    <div className="ip-header">
                        <span className="ip-emoji">{selDef.emoji}</span>
                        <div className="ip-header-text">
                            <span className="ip-title">{sel.props.name || 'UNKNOWN'}</span>
                            <span className="ip-badge" style={{ borderColor: `${selColor}80`, color: selColor }}>
                                {selDef.label}
                            </span>
                        </div>
                    </div>
                    <div className="ip-divider" />

                    <div className="ip-fields">
                        {popupFields.map((f, i) => (
                            <div key={i} className="ip-field">
                                <span className="ip-field-label">{f.label}</span>
                                <span className="ip-field-value">{f.value}</span>
                            </div>
                        ))}
                    </div>

                    {sel.props.note && (
                        <>
                            <div className="ip-divider" />
                            <div className="ip-note">{sel.props.note}</div>
                        </>
                    )}
                </div>
            )}

            <style>{`
                .infra-layers { position:absolute; inset:0; z-index:4; }

                .infra-popup {
                    position: absolute; z-index: 15;
                    min-width: 220px; max-width: 300px;
                    padding: 10px 14px;
                    background: rgba(0,0,0,0.88);
                    border: 1px solid rgba(255,255,255,0.12);
                    font-family: 'Share Tech Mono', monospace;
                    backdrop-filter: blur(8px);
                    animation: ipPopIn 0.2s ease-out;
                }
                @keyframes ipPopIn {
                    from { opacity:0; transform:scale(0.92) translateY(4px); }
                    to { opacity:1; transform:scale(1) translateY(0); }
                }

                .mm-corner {
                    position:absolute; width:6px; height:6px; pointer-events:none;
                }
                .mm-corner.tl { top:-1px; left:-1px; border-top:1.5px solid; border-left:1.5px solid; }
                .mm-corner.tr { top:-1px; right:-1px; border-top:1.5px solid; border-right:1.5px solid; }
                .mm-corner.bl { bottom:-1px; left:-1px; border-bottom:1.5px solid; border-left:1.5px solid; }
                .mm-corner.br { bottom:-1px; right:-1px; border-bottom:1.5px solid; border-right:1.5px solid; }

                .ip-close {
                    position:absolute; top:4px; right:6px;
                    background:none; border:none; color:rgba(255,255,255,0.4);
                    font-size:12px; cursor:pointer; padding:2px 4px;
                    font-family:'Share Tech Mono',monospace; line-height:1;
                }
                .ip-close:hover { color:#ff5555; }

                .ip-header { display:flex; align-items:center; gap:8px; padding-right:20px; }
                .ip-emoji { font-size:18px; line-height:1; }
                .ip-header-text { display:flex; flex-direction:column; gap:2px; }
                .ip-title {
                    font-family:'Orbitron',monospace; font-size:9px; font-weight:600;
                    letter-spacing:1.5px; color:rgba(255,255,255,0.9);
                }
                .ip-badge {
                    font-size:7px; letter-spacing:1.5px; border:1px solid;
                    padding:1px 5px; line-height:1.3; width:fit-content; white-space:nowrap;
                }

                .ip-divider { width:100%; height:1px; background:rgba(255,255,255,0.08); margin:6px 0; }

                .ip-fields { display:flex; flex-direction:column; gap:3px; }
                .ip-field { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
                .ip-field-label { font-size:7px; letter-spacing:2px; color:rgba(255,255,255,0.35); white-space:nowrap; }
                .ip-field-value { font-size:9px; letter-spacing:0.5px; color:rgba(255,255,255,0.8); text-align:right; }

                .ip-note {
                    font-size:8px; color:rgba(255,255,255,0.45); line-height:1.4;
                    letter-spacing:0.5px; font-style:italic;
                }
            `}</style>
        </div>
    );
};

export default InfrastructureLayers;
