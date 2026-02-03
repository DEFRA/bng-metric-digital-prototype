const distinctivenesScores = {
  "V.High": {
    "Score": 8,
    "Suggested action": "Same habitat required - bespoke compensation option"
  },
  "High": {
    "Score": 6,
    "Suggested action": "Same habitat required ="
  },
  "Medium": {
    "Score": 4,
    "Suggested action": "Same broad habitat or a higher distinctiveness habitat required (≥)"
  },
  "Low": {
    "Score": 2,
    "Suggested action": "Same distinctiveness or better habitat required ≥"
  },
  "V.Low": {
    "Score": 0,
    "Suggested action": "Compensation Not Required"
  }
}

const conditionScores = {
  "Good": 3,
  "Fairly Good": 2.5,
  "Moderate": 2,
  "Fairly Poor": 1.5,
  "Poor": 1,
  "Condition Assessment N/A": 1,
  "N/A - Other": 0
}

const distinctivenessCategories = {
  "Cropland - Arable field margins cultivated annually": "Medium",
  "Cropland - Arable field margins game bird mix": "Medium",
  "Cropland - Arable field margins pollen and nectar": "Medium",
  "Cropland - Arable field margins tussocky": "Medium",
  "Cropland - Cereal crops": "Low",
  "Cropland - Winter stubble": "Low",
  "Cropland - Horticulture": "Low",
  "Cropland - Intensive orchards": "Low",
  "Cropland - Non-cereal crops": "Low",
  "Cropland - Temporary grass and clover leys": "Low",
  "Grassland - Traditional orchards": "High",
  "Grassland - Bracken": "Low",
  "Grassland - Floodplain wetland mosaic and CFGM": "High",
  "Grassland - Lowland calcareous grassland": "High",
  "Grassland - Lowland dry acid grassland": "V.High",
  "Grassland - Lowland meadows": "V.High",
  "Grassland - Modified grassland": "Low",
  "Grassland - Other lowland acid grassland": "Medium",
  "Grassland - Other neutral grassland": "Medium",
  "Grassland - Tall herb communities (H6430)": "High",
  "Grassland - Upland acid grassland": "Medium",
  "Grassland - Upland calcareous grassland": "High",
  "Grassland - Upland hay meadows": "V.High",
  "Heathland and shrub - Blackthorn scrub": "Medium",
  "Heathland and shrub - Bramble scrub": "Medium",
  "Heathland and shrub - Gorse scrub": "Medium",
  "Heathland and shrub - Hawthorn scrub": "Medium",
  "Heathland and shrub - Hazel scrub": "Medium",
  "Heathland and shrub - Lowland heathland": "High",
  "Heathland and shrub - Mixed scrub": "Medium",
  "Heathland and shrub - Mountain heaths and willow scrub": "V.High",
  "Heathland and shrub - Rhododendron scrub": "Low",
  "Heathland and shrub - Dunes with sea buckthorn (H2160)": "High",
  "Heathland and shrub - Other sea buckthorn scrub": "Low",
  "Heathland and shrub - Willow scrub": "Medium",
  "Heathland and shrub - Upland heathland": "High",
  "Lakes - Aquifer fed naturally fluctuating water bodies": "V.High",
  "Lakes - Ornamental lake or pond": "Low",
  "Lakes - High alkalinity lakes": "High",
  "Lakes - Low alkalinity lakes": "High",
  "Lakes - Marl lakes": "High",
  "Lakes - Moderate alkalinity lakes": "High",
  "Lakes - Peat lakes": "High",
  "Lakes - Ponds (priority habitat)": "High",
  "Lakes - Ponds (non-priority habitat)": "Medium",
  "Lakes - Reservoirs": "Medium",
  "Lakes - Temporary lakes ponds and pools (H3170)": "High",
  "Sparsely vegetated land - Calaminarian grasslands": "V.High",
  "Sparsely vegetated land - Coastal sand dunes": "High",
  "Sparsely vegetated land - Coastal vegetated shingle": "High",
  "Sparsely vegetated land - Ruderal/Ephemeral": "Low",
  "Sparsely vegetated land - Tall forbs": "Low",
  "Sparsely vegetated land - Inland rock outcrop and scree habitats": "High",
  "Sparsely vegetated land - Limestone pavement": "V.High",
  "Sparsely vegetated land - Maritime cliff and slopes": "High",
  "Sparsely vegetated land - Other inland rock and scree": "Medium",
  "Urban - Allotments": "Low",
  "Urban - Artificial unvegetated, unsealed surface": "V.Low",
  "Urban - Bioswale": "Low",
  "Urban - Intensive green roof": "Low",
  "Urban - Built linear features": "V.Low",
  "Urban - Cemeteries and churchyards": "Medium",
  "Urban - Developed land; sealed surface": "V.Low",
  "Urban - Other green roof": "Low",
  "Urban - Facade-bound green wall": "Low",
  "Urban - Ground based green wall": "Low",
  "Urban - Ground level planters": "Low",
  "Urban - Biodiverse green roof": "Medium",
  "Urban - Introduced shrub": "Low",
  "Urban - Open mosaic habitats on previously developed land": "High",
  "Urban - Rain garden": "Low",
  "Urban - Actively worked sand pit quarry or open cast mine": "Low",
  "Urban - Sustainable drainage system": "Low",
  "Urban - Unvegetated garden": "V.Low",
  "Urban - Vacant or derelict land": "Low",
  "Urban - Bare ground": "Low",
  "Urban - Vegetated garden": "Low",
  "Individual trees - Urban tree": "Medium",
  "Individual trees - Rural tree": "Medium",
  "Wetland - Blanket bog": "V.High",
  "Wetland - Depressions on peat substrates (H7150)": "V.High",
  "Wetland - Fens (upland and lowland)": "V.High",
  "Wetland - Lowland raised bog": "V.High",
  "Wetland - Oceanic valley mire[1] (D2.1)": "V.High",
  "Wetland - Purple moor grass and rush pastures": "V.High",
  "Wetland - Reedbeds": "High",
  "Wetland - Transition mires and quaking bogs (H7140)": "V.High",
  "Woodland and forest - Felled": "High",
  "Woodland and forest - Lowland beech and yew woodland": "High",
  "Woodland and forest - Lowland mixed deciduous woodland": "High",
  "Woodland and forest - Native pine woodlands": "High",
  "Woodland and forest - Other coniferous woodland": "Low",
  "Woodland and forest - Other Scot's pine woodland": "Medium",
  "Woodland and forest - Other woodland; broadleaved": "Medium",
  "Woodland and forest - Other woodland; mixed": "Medium",
  "Woodland and forest - Upland birchwoods": "High",
  "Woodland and forest - Upland mixed ashwoods": "High",
  "Woodland and forest - Upland oakwood": "High",
  "Woodland and forest - Wet woodland": "High",
  "Woodland and forest - Wood-pasture and parkland": "V.High",
  "Coastal lagoons - Coastal lagoons": "High",
  "Rocky shore - High energy littoral rock": "High",
  "Rocky shore - High energy littoral rock - on peat, clay or chalk": "V.High",
  "Rocky shore - Moderate energy littoral rock": "High",
  "Rocky shore - Moderate energy littoral rock - on peat, clay or chalk": "V.High",
  "Rocky shore - Low energy littoral rock": "High",
  "Rocky shore - Low energy littoral rock - on peat, clay or chalk": "V.High",
  "Rocky shore - Features of littoral rock": "High",
  "Rocky shore - Features of littoral rock - on peat, clay or chalk": "V.High",
  "Coastal saltmarsh - Saltmarshes and saline reedbeds": "High",
  "Coastal saltmarsh - Artificial saltmarshes and saline reedbeds": "Low",
  "Intertidal sediment - Littoral coarse sediment": "Medium",
  "Intertidal sediment - Littoral mud": "High",
  "Intertidal sediment - Littoral mixed sediments": "High",
  "Intertidal sediment - Littoral seagrass": "High",
  "Intertidal sediment - Littoral seagrass on peat, clay or chalk": "V.High",
  "Intertidal sediment - Littoral biogenic reefs - Mussels": "High",
  "Intertidal sediment - Littoral biogenic reefs - Sabellaria": "High",
  "Intertidal sediment - Features of littoral sediment": "High",
  "Intertidal sediment - Artificial littoral coarse sediment": "Low",
  "Intertidal sediment - Artificial littoral mud": "Low",
  "Intertidal sediment - Artificial littoral sand": "Low",
  "Intertidal sediment - Artificial littoral muddy sand": "Low",
  "Intertidal sediment - Artificial littoral mixed sediments": "Low",
  "Intertidal sediment - Artificial littoral seagrass": "Low",
  "Intertidal sediment - Artificial littoral biogenic reefs": "Low",
  "Intertidal sediment - Littoral sand": "Medium",
  "Intertidal sediment - Littoral muddy sand": "High",
  "Intertidal hard structures - Artificial hard structures": "Low",
  "Intertidal hard structures - Artificial features of hard structures": "Low",
  "Infrastructure (IGGI) - Infrastructure (IGGI)": "Medium",
  "Watercourse footprint - Watercourse footprint": "V.Low",
}

const conditionMultiplier = {
  "Cropland - Arable field margins cultivated annually": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Arable field margins game bird mix": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Arable field margins pollen and nectar": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Arable field margins tussocky": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Cereal crops": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Winter stubble": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Horticulture": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Intensive orchards": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Non-cereal crops": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Cropland - Temporary grass and clover leys": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Grassland - Traditional orchards": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Bracken": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Grassland - Floodplain wetland mosaic and CFGM": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Lowland calcareous grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Lowland dry acid grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Lowland meadows": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Modified grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Other lowland acid grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Other neutral grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Tall herb communities (H6430)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Upland acid grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Upland calcareous grassland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Grassland - Upland hay meadows": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Blackthorn scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Bramble scrub": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Gorse scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Hawthorn scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Hazel scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Lowland heathland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Mixed scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Mountain heaths and willow scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Rhododendron scrub": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Dunes with sea buckthorn (H2160)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Other sea buckthorn scrub": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Willow scrub": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Heathland and shrub - Upland heathland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Aquifer fed naturally fluctuating water bodies": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - High alkalinity lakes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Low alkalinity lakes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Marl lakes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Moderate alkalinity lakes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Peat lakes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Ponds (priority habitat)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Ponds (non-priority habitat)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Reservoirs": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Temporary lakes ponds and pools (H3170)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Calaminarian grasslands": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Coastal sand dunes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Coastal vegetated shingle": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Ruderal/Ephemeral": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Tall forbs": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Inland rock outcrop and scree habitats": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Limestone pavement": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Maritime cliff and slopes": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Sparsely vegetated land - Other inland rock and scree": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Allotments": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Lakes - Ornamental lake or pond": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Artificial unvegetated, unsealed surface": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": 0
  },
  "Urban - Bioswale": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Intensive green roof": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Built linear features": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": 0
  },
  "Urban - Cemeteries and churchyards": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Developed land; sealed surface": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": 0
  },
  "Urban - Other green roof": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Urban - Facade-bound green wall": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Ground based green wall": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Ground level planters": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Urban - Biodiverse green roof": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Introduced shrub": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Urban - Open mosaic habitats on previously developed land": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Rain garden": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Actively worked sand pit quarry or open cast mine": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Individual trees - Urban tree": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Sustainable drainage system": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Unvegetated garden": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": 0
  },
  "Urban - Vacant or derelict land": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Bare ground": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Urban - Vegetated garden": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": 1,
    "N/A - Other": "Not Possible"
  },
  "Wetland - Blanket bog": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Depressions on peat substrates (H7150)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Fens (upland and lowland)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Lowland raised bog": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Oceanic valley mire[1] (D2.1)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Purple moor grass and rush pastures": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Reedbeds": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Wetland - Transition mires and quaking bogs (H7140)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Felled": {
    "Good": 3,
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Lowland beech and yew woodland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Lowland mixed deciduous woodland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Native pine woodlands": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Other coniferous woodland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Other Scot's pine woodland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Other woodland; broadleaved": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Other woodland; mixed": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Upland birchwoods": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Upland mixed ashwoods": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Upland oakwood": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Wet woodland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Woodland and forest - Wood-pasture and parkland": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Coastal lagoons - Coastal lagoons": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - High energy littoral rock": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - High energy littoral rock - on peat, clay or chalk": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - Moderate energy littoral rock": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - Moderate energy littoral rock - on peat, clay or chalk": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - Low energy littoral rock": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - Low energy littoral rock - on peat, clay or chalk": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - Features of littoral rock": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Rocky shore - Features of littoral rock - on peat, clay or chalk": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral coarse sediment": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral mud": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral mixed sediments": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Coastal saltmarsh - Saltmarshes and saline reedbeds": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Coastal saltmarsh - Artificial saltmarshes and saline reedbeds": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral seagrass": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral seagrass on peat, clay or chalk": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral biogenic reefs - Mussels": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral biogenic reefs - Sabellaria": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Features of littoral sediment": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral coarse sediment": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral mud": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral sand": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral muddy sand": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral mixed sediments": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral seagrass": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Artificial littoral biogenic reefs": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral sand": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal sediment - Littoral muddy sand": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal hard structures - Artificial hard structures": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal hard structures - Artificial features of hard structures": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Intertidal hard structures - Artificial hard structures with integrated greening of grey infrastructure (IGGI)": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  },
  "Watercourse footprint - Watercourse footprint": {
    "Good": "Not Possible",
    "Fairly Good": "Not Possible",
    "Moderate": "Not Possible",
    "Fairly Poor": "Not Possible",
    "Poor": "Not Possible",
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": 0
  },
  "Individual trees - Rural tree": {
    "Good": 3,
    "Fairly Good": 2.5,
    "Moderate": 2,
    "Fairly Poor": 1.5,
    "Poor": 1,
    "Condition Assessment N/A": "Not Possible",
    "N/A - Other": "Not Possible"
  }
}

const habitatDifficulty = {
  "Coastal lagoons": {
    "Creation": "Medium",
    "Enhancement": "Medium"   
  },

  "Coastal saltmarsh - Saltmarshes and saline reedbeds": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Cropland - Arable field margins cultivated annually": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Arable field margins game bird mix": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Arable field margins pollen and nectar": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Arable field margins tussocky": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Cereal crops": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Winter stubble": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Horticulture": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Intensive orchards": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Non-cereal crops": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Cropland - Temporary grass and clover leys": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Grassland - Traditional orchards": {
    "Creation": "Low",
    "Enhancement": "Medium"
  },
  "Grassland - Bracken": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Grassland - Floodplain wetland mosaic and CFGM": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Grassland - Lowland calcareous grassland": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Grassland - Lowland dry acid grassland": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Grassland - Lowland meadows": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Grassland - Modified grassland": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Grassland - Other lowland acid grassland": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Grassland - Other neutral grassland": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Grassland - Tall herb communities (H6430)": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Grassland - Upland acid grassland": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Grassland - Upland calcareous grassland": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Grassland - Upland hay meadows": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Heathland and shrub - Blackthorn scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Bramble scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Gorse scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Hawthorn scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Hazel scrub": {
    "Creation": "Medium",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Willow scrub": {
    "Creation": "Medium",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Lowland heathland": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Heathland and shrub - Mixed scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Mountain heaths and willow scrub": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Heathland and shrub - Rhododendron scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Dunes with sea buckthorn (H2160)": {
    "Creation": "Medium",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Other sea buckthorn scrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Heathland and shrub - Upland heathland": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral biogenic reefs": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral coarse sediment": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral mixed sediments": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral muddy sand": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral seagrass": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Intertidal sediment - Features of littoral sediment": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral biogenic reefs - Sabellaria": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral coarse sediment": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral mixed sediments": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral mud": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral seagrass": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Intertidal sediment - Littoral seagrass on peat, clay or chalk": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Lakes - Aquifer fed naturally fluctuating water bodies": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Lakes - Ornamental lake or pond": {
    "Creation": "Low",
    "Enhancement": "High"
  },
  "Lakes - High alkalinity lakes": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Lakes - Low alkalinity lakes": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Lakes - Marl lakes": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Lakes - Moderate alkalinity lakes": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Lakes - Peat lakes": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Lakes - Ponds (non-priority habitat)": {
    "Creation": "Low",
    "Enhancement": "Medium"
  },
  "Lakes - Ponds (priority habitat)": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Lakes - Reservoirs": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Lakes - Temporary lakes ponds and pools (H3170)": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Rocky shore - Features of littoral rock": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Rocky shore - Features of littoral rock - on peat, clay or chalk": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Rocky shore - High energy littoral rock": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Rocky shore - High energy littoral rock - on peat, clay or chalk": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Rocky shore - Low energy littoral rock": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Rocky shore - Low energy littoral rock - on peat, clay or chalk": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Rocky shore - Moderate energy littoral rock": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Rocky shore - Moderate energy littoral rock - on peat, clay or chalk": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Calaminarian grasslands": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Coastal sand dunes": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Coastal vegetated shingle": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Inland rock outcrop and scree habitats": {
    "Creation": "High",
    "Enhancement": "Low"
  },
  "Sparsely vegetated land - Limestone pavement": {
    "Creation": "Very High",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Maritime cliff and slopes": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Other inland rock and scree": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Ruderal/Ephemeral": {
    "Creation": "Low",
    "Enhancement": "Medium"
  },
  "Sparsely vegetated land - Tall forbs": {
    "Creation": "Low",
    "Enhancement": "Medium"
  },
  "Urban - Vacant or derelict land": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Bare ground": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Allotments": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Artificial unvegetated, unsealed surface": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Bioswale": {
    "Creation": "Medium",
    "Enhancement": "Low"
  },
  "Urban - Intensive green roof": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Built linear features": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Cemeteries and churchyards": {
    "Creation": "Medium",
    "Enhancement": "Low"
  },
  "Urban - Developed land; sealed surface": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Other green roof": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Facade-bound green wall": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Urban - Ground based green wall": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Urban - Ground level planters": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Biodiverse green roof": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Urban - Introduced shrub": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Open mosaic habitats on previously developed land": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Urban - Rain garden": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Actively worked sand pit quarry or open cast mine": {
    "Creation": "Medium",
    "Enhancement": "Low"
  },
  "Individual trees - Urban tree": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Sustainable drainage system": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Urban - Unvegetated garden": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Urban - Vegetated garden": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Wetland - Blanket bog": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Wetland - Depressions on peat substrates (H7150)": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Wetland - Fens (upland and lowland)": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Wetland - Lowland raised bog": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Wetland - Oceanic valley mire[1] (D2.1)": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Wetland - Purple moor grass and rush pastures": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Wetland - Reedbeds": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Wetland - Transition mires and quaking bogs (H7140)": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Woodland and forest - Felled": {
    "Creation": "High",
    "Enhancement": "Low"
  },
  "Woodland and forest - Lowland beech and yew woodland": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Woodland and forest - Lowland mixed deciduous woodland": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Woodland and forest - Native pine woodlands": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Woodland and forest - Other coniferous woodland": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Woodland and forest - Other Scot's pine woodland": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Woodland and forest - Other woodland; broadleaved": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Woodland and forest - Other woodland; mixed": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Woodland and forest - Upland birchwoods": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Woodland and forest - Upland mixed ashwoods": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Woodland and forest - Upland oakwood": {
    "Creation": "High",
    "Enhancement": "High"
  },
  "Woodland and forest - Wet woodland": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Woodland and forest - Wood-pasture and parkland": {
    "Creation": "Very High",
    "Enhancement": "High"
  },
  "Intertidal sediment - Littoral sand": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral muddy sand": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal hard structures - Artificial hard structures": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Intertidal hard structures - Artificial features of hard structures": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Intertidal hard structures - Artificial hard structures with integrated greening of grey infrastructure (IGGI)": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Coastal saltmarsh - Artificial saltmarshes and saline reedbeds": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Littoral biogenic reefs - Mussels": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral mud": {
    "Creation": "High",
    "Enhancement": "Medium"
  },
  "Intertidal sediment - Artificial littoral sand": {
    "Creation": "Medium",
    "Enhancement": "Medium"
  },
  "Watercourse footprint - Watercourse footprint": {
    "Creation": "Low",
    "Enhancement": "Low"
  },
  "Individual trees - Rural tree": {
    "Creation": "Low",
    "Enhancement": "Low"
  },

}

const habitatDifficultyMultiplier = {
  "Low": 1,
  "Medium": 0.67,
  "High": 0.33,
  "Very High": 0.1
}


const timeToTarget = {
  "0": 1,
  "1": 0.965,
  "2": 0.931,
  "3": 0.899,
  "4": 0.867,
  "5": 0.837,
  "6": 0.808,
  "7": 0.779,
  "8": 0.752,
  "9": 0.726,
  "10": 0.7,
  "11": 0.676,
  "12": 0.652,
  "13": 0.629,
  "14": 0.607,
  "15": 0.586,
  "16": 0.566,
  "17": 0.546,
  "18": 0.527,
  "19": 0.508,
  "20": 0.49,
  "21": 0.473,
  "22": 0.457,
  "23": 0.441,
  "24": 0.425,
  "25": 0.41,
  "26": 0.396,
  "27": 0.382,
  "28": 0.369,
  "29": 0.356,
  "30": 0.343,
  ">30": 0.32
}

function doSomething(){
  return 1
}

module.exports = {
  doSomething
}
