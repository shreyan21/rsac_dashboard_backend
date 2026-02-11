const SCHEMA = {
    sarus_2_09_2020: {
      hasDistrict: true,
      hasThreats:true,
      hasSite: true,
      hasAdults: true,
      hasJuvenile: true,
      hasNests: true
    },
  
    sarus_21_01_2021: {
      hasDistrict: true,
      hasSite: true,
      hasThreats:true,
      hasAdults: true,
      hasJuvenile: true,
      hasNests: true
    },
  
    sarus_27_09_2021: {
      hasDistrict: true,
      hasSite: true,
      hasThreats:true,
      hasAdults: false,   // IMPORTANT
      hasJuvenile: true,
      hasNests: true
    },
  
    sarus_lucknow_population: {
      hasDistrict: false,
      hasSite: false,     // IMPORTANT
      hasAdults: true,
      hasJuvenile: true,
      hasNests: true,
      hasRangeFO: true,
      hasColony: true
    }
  };
  
  export default SCHEMA;
  