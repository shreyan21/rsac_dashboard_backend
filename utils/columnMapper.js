module.exports = function normalizeColumns(row, index, isLucknow=false) {

    const mapped = {
      SNO: index + 1,
      DISTRICT: row.district,
      LATITUDE: row.latitude,
      LONGITUDE: row.longitude,
      "SARUS COUNT": row.sarus_count,
      ADULTS: row.adults,
      JUVENILE: row.juvenile,
      NESTS: row.nests,
      SITE: row.site,
      HABITAT: row.habitat,
      THREATS: row.threats,
      DATE: row.date
    };
  
    if (isLucknow) {
      mapped["RANGE FOREST"] = row.range_fo;
      mapped["NAME OF COLONY"] = row.name_of_co;
      delete mapped.DISTRICT;
    }
  
    return mapped;
  };
  