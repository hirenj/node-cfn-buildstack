function find_keys(keyname, object) {
  let results;
  if (Array.isArray(object)) {
    results = object.map(find_keys.bind(null,keyname)).reduce( (a, b) => {
      a = a || [];
      b = b || [];
      return a.concat(b);
    },[]);
    return results.filter( val => val );
  }
  results = [];
  if (typeof object == 'object') {
    if (object.class == keyname) {
      results.push(object.data);
    }
    Object.keys(object).forEach(key => {
      if (key === keyname) {
        results.push(object[key]);
      } else {
        results = results.concat(find_keys(keyname,object[key]));
      }
    });
    return results.filter( val => val );
  }
  return;
}

module.exports = { find_keys };