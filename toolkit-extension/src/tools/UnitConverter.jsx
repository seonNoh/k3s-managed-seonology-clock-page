import { useState, useCallback, useMemo } from 'react';
import './UnitConverter.css';

// ===== SVG ICONS =====
const svgProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const ICONS = {
  length: <svg {...svgProps}><path d="M2 12h20" /><path d="M6 8v8" /><path d="M18 8v8" /><path d="M10 10v4" /><path d="M14 10v4" /></svg>,
  weight: <svg {...svgProps}><path d="M12 3a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z" /><path d="M8 7l-2 13h12L16 7" /><circle cx="12" cy="14" r="2" /></svg>,
  temperature: <svg {...svgProps}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>,
  area: <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" /></svg>,
  volume: <svg {...svgProps}><path d="M5 15V5a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v8" /><ellipse cx="12" cy="17" rx="7" ry="4" /><path d="M5 13c0 2.21 3.13 4 7 4s7-1.79 7-4" /></svg>,
  speed: <svg {...svgProps}><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0" /><path d="M12 7v5l3 3" /><path d="M16.5 3.5l1 1" /><path d="M7.5 3.5l-1 1" /></svg>,
  time: <svg {...svgProps}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  digital: <svg {...svgProps}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01" /><path d="M10 8h.01" /><path d="M14 8h.01" /><path d="M18 8h.01" /><path d="M6 12h.01" /><path d="M10 12h.01" /><path d="M14 12h.01" /><path d="M18 12h.01" /><path d="M6 16h.01" /><path d="M10 16h.01" /></svg>,
  pressure: <svg {...svgProps}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /><path d="M8 12h8" /></svg>,
  energy: <svg {...svgProps}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  power: <svg {...svgProps}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg>,
  frequency: <svg {...svgProps}><path d="M2 12h4l3-9 4 18 3-9h6" /></svg>,
  angle: <svg {...svgProps}><path d="M21 19H3V5" /><path d="M3 19l13-13" /><path d="M9 19a6 6 0 0 0-6-6" /></svg>,
  fuel: <svg {...svgProps}><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17" /><path d="M15 11h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V8l-4-3" /><rect x="6" y="7" width="6" height="5" /></svg>,
  cooking: <svg {...svgProps}><path d="M15 11h.01" /><path d="M11 15h.01" /><path d="M16 16h.01" /><circle cx="12" cy="12" r="10" /><path d="M2 12c2-3 6-6 10-6s8 3 10 6" /></svg>,
};

// ===== UNIT DEFINITIONS =====
const CATEGORIES = [
  {
    id: 'length', name: 'Length',
    units: [
      { id: 'km', name: 'Kilometer', symbol: 'km', factor: 1000 },
      { id: 'm', name: 'Meter', symbol: 'm', factor: 1 },
      { id: 'cm', name: 'Centimeter', symbol: 'cm', factor: 0.01 },
      { id: 'mm', name: 'Millimeter', symbol: 'mm', factor: 0.001 },
      { id: 'um', name: 'Micrometer', symbol: 'μm', factor: 1e-6 },
      { id: 'nm', name: 'Nanometer', symbol: 'nm', factor: 1e-9 },
      { id: 'mi', name: 'Mile', symbol: 'mi', factor: 1609.344 },
      { id: 'yd', name: 'Yard', symbol: 'yd', factor: 0.9144 },
      { id: 'ft', name: 'Foot', symbol: 'ft', factor: 0.3048 },
      { id: 'in', name: 'Inch', symbol: 'in', factor: 0.0254 },
      { id: 'nmi', name: 'Nautical Mile', symbol: 'nmi', factor: 1852 },
      { id: 'li', name: '리 (里)', symbol: '리', factor: 392.727 },
      { id: 'chi', name: '척 (尺)', symbol: '척', factor: 0.303 },
    ],
    defaultFrom: 'km', defaultTo: 'mi',
  },
  {
    id: 'weight', name: 'Weight',
    units: [
      { id: 'ton', name: 'Metric Ton', symbol: 't', factor: 1000000 },
      { id: 'kg', name: 'Kilogram', symbol: 'kg', factor: 1000 },
      { id: 'g', name: 'Gram', symbol: 'g', factor: 1 },
      { id: 'mg', name: 'Milligram', symbol: 'mg', factor: 0.001 },
      { id: 'ug', name: 'Microgram', symbol: 'μg', factor: 1e-6 },
      { id: 'lb', name: 'Pound', symbol: 'lb', factor: 453.592 },
      { id: 'oz', name: 'Ounce', symbol: 'oz', factor: 28.3495 },
      { id: 'st', name: 'Stone', symbol: 'st', factor: 6350.29 },
      { id: 'impTon', name: 'Imperial Ton', symbol: 'imp t', factor: 1016046.9 },
      { id: 'usTon', name: 'US Ton', symbol: 'US t', factor: 907184.7 },
      { id: 'ct', name: 'Carat', symbol: 'ct', factor: 0.2 },
      { id: 'geun', name: '근 (斤)', symbol: '근', factor: 600 },
      { id: 'don', name: '돈 (錢)', symbol: '돈', factor: 3.75 },
      { id: 'nyang', name: '냥 (兩)', symbol: '냥', factor: 37.5 },
    ],
    defaultFrom: 'kg', defaultTo: 'lb',
  },
  {
    id: 'temperature', name: 'Temperature',
    units: [
      { id: 'c', name: 'Celsius', symbol: '°C' },
      { id: 'f', name: 'Fahrenheit', symbol: '°F' },
      { id: 'k', name: 'Kelvin', symbol: 'K' },
      { id: 'r', name: 'Rankine', symbol: '°R' },
    ],
    custom: true,
    defaultFrom: 'c', defaultTo: 'f',
  },
  {
    id: 'area', name: 'Area',
    units: [
      { id: 'km2', name: 'Square Kilometer', symbol: 'km²', factor: 1e6 },
      { id: 'ha', name: 'Hectare', symbol: 'ha', factor: 10000 },
      { id: 'm2', name: 'Square Meter', symbol: 'm²', factor: 1 },
      { id: 'cm2', name: 'Square Centimeter', symbol: 'cm²', factor: 0.0001 },
      { id: 'mm2', name: 'Square Millimeter', symbol: 'mm²', factor: 1e-6 },
      { id: 'mi2', name: 'Square Mile', symbol: 'mi²', factor: 2589988.11 },
      { id: 'ac', name: 'Acre', symbol: 'ac', factor: 4046.856 },
      { id: 'ft2', name: 'Square Foot', symbol: 'ft²', factor: 0.092903 },
      { id: 'in2', name: 'Square Inch', symbol: 'in²', factor: 0.00064516 },
      { id: 'pyeong', name: '평 (坪)', symbol: '평', factor: 3.30579 },
      { id: 'dan', name: '단보 (段步)', symbol: '단보', factor: 991.736 },
      { id: 'jeongbo', name: '정보 (町步)', symbol: '정보', factor: 9917.36 },
    ],
    defaultFrom: 'm2', defaultTo: 'pyeong',
  },
  {
    id: 'volume', name: 'Volume',
    units: [
      { id: 'm3', name: 'Cubic Meter', symbol: 'm³', factor: 1000 },
      { id: 'l', name: 'Liter', symbol: 'L', factor: 1 },
      { id: 'ml', name: 'Milliliter', symbol: 'mL', factor: 0.001 },
      { id: 'gal', name: 'US Gallon', symbol: 'gal', factor: 3.78541 },
      { id: 'impGal', name: 'Imperial Gallon', symbol: 'imp gal', factor: 4.54609 },
      { id: 'qt', name: 'US Quart', symbol: 'qt', factor: 0.946353 },
      { id: 'pt', name: 'US Pint', symbol: 'pt', factor: 0.473176 },
      { id: 'cup', name: 'US Cup', symbol: 'cup', factor: 0.236588 },
      { id: 'floz', name: 'US Fluid Ounce', symbol: 'fl oz', factor: 0.0295735 },
      { id: 'tbsp', name: 'Tablespoon', symbol: 'tbsp', factor: 0.0147868 },
      { id: 'tsp', name: 'Teaspoon', symbol: 'tsp', factor: 0.00492892 },
      { id: 'ft3', name: 'Cubic Foot', symbol: 'ft³', factor: 28.3168 },
      { id: 'in3', name: 'Cubic Inch', symbol: 'in³', factor: 0.0163871 },
      { id: 'doe', name: '되 (升)', symbol: '되', factor: 1.8039 },
      { id: 'mal', name: '말 (斗)', symbol: '말', factor: 18.039 },
    ],
    defaultFrom: 'l', defaultTo: 'gal',
  },
  {
    id: 'speed', name: 'Speed',
    units: [
      { id: 'ms', name: 'Meter/Second', symbol: 'm/s', factor: 1 },
      { id: 'kmh', name: 'Km/Hour', symbol: 'km/h', factor: 0.277778 },
      { id: 'mph', name: 'Mile/Hour', symbol: 'mph', factor: 0.44704 },
      { id: 'kn', name: 'Knot', symbol: 'kn', factor: 0.514444 },
      { id: 'fts', name: 'Foot/Second', symbol: 'ft/s', factor: 0.3048 },
      { id: 'mach', name: 'Mach', symbol: 'Mach', factor: 343 },
      { id: 'c', name: 'Speed of Light', symbol: 'c', factor: 299792458 },
    ],
    defaultFrom: 'kmh', defaultTo: 'mph',
  },
  {
    id: 'time', name: 'Time',
    units: [
      { id: 'y', name: 'Year', symbol: 'yr', factor: 31536000 },
      { id: 'mo', name: 'Month', symbol: 'mo', factor: 2592000 },
      { id: 'wk', name: 'Week', symbol: 'wk', factor: 604800 },
      { id: 'd', name: 'Day', symbol: 'd', factor: 86400 },
      { id: 'h', name: 'Hour', symbol: 'h', factor: 3600 },
      { id: 'min', name: 'Minute', symbol: 'min', factor: 60 },
      { id: 's', name: 'Second', symbol: 's', factor: 1 },
      { id: 'ms', name: 'Millisecond', symbol: 'ms', factor: 0.001 },
      { id: 'us', name: 'Microsecond', symbol: 'μs', factor: 1e-6 },
      { id: 'ns', name: 'Nanosecond', symbol: 'ns', factor: 1e-9 },
    ],
    defaultFrom: 'h', defaultTo: 'min',
  },
  {
    id: 'digital', name: 'Digital Storage',
    units: [
      { id: 'bit', name: 'Bit', symbol: 'bit', factor: 1 },
      { id: 'byte', name: 'Byte', symbol: 'B', factor: 8 },
      { id: 'kb', name: 'Kilobyte', symbol: 'KB', factor: 8000 },
      { id: 'kib', name: 'Kibibyte', symbol: 'KiB', factor: 8192 },
      { id: 'mb', name: 'Megabyte', symbol: 'MB', factor: 8e6 },
      { id: 'mib', name: 'Mebibyte', symbol: 'MiB', factor: 8388608 },
      { id: 'gb', name: 'Gigabyte', symbol: 'GB', factor: 8e9 },
      { id: 'gib', name: 'Gibibyte', symbol: 'GiB', factor: 8589934592 },
      { id: 'tb', name: 'Terabyte', symbol: 'TB', factor: 8e12 },
      { id: 'tib', name: 'Tebibyte', symbol: 'TiB', factor: 8796093022208 },
      { id: 'pb', name: 'Petabyte', symbol: 'PB', factor: 8e15 },
    ],
    defaultFrom: 'gb', defaultTo: 'mb',
  },
  {
    id: 'pressure', name: 'Pressure',
    units: [
      { id: 'pa', name: 'Pascal', symbol: 'Pa', factor: 1 },
      { id: 'kpa', name: 'Kilopascal', symbol: 'kPa', factor: 1000 },
      { id: 'mpa', name: 'Megapascal', symbol: 'MPa', factor: 1e6 },
      { id: 'bar', name: 'Bar', symbol: 'bar', factor: 100000 },
      { id: 'mbar', name: 'Millibar', symbol: 'mbar', factor: 100 },
      { id: 'atm', name: 'Atmosphere', symbol: 'atm', factor: 101325 },
      { id: 'psi', name: 'PSI', symbol: 'psi', factor: 6894.76 },
      { id: 'mmhg', name: 'mmHg', symbol: 'mmHg', factor: 133.322 },
      { id: 'torr', name: 'Torr', symbol: 'Torr', factor: 133.322 },
      { id: 'inhg', name: 'inHg', symbol: 'inHg', factor: 3386.39 },
    ],
    defaultFrom: 'atm', defaultTo: 'psi',
  },
  {
    id: 'energy', name: 'Energy',
    units: [
      { id: 'j', name: 'Joule', symbol: 'J', factor: 1 },
      { id: 'kj', name: 'Kilojoule', symbol: 'kJ', factor: 1000 },
      { id: 'cal', name: 'Calorie', symbol: 'cal', factor: 4.184 },
      { id: 'kcal', name: 'Kilocalorie', symbol: 'kcal', factor: 4184 },
      { id: 'wh', name: 'Watt-hour', symbol: 'Wh', factor: 3600 },
      { id: 'kwh', name: 'Kilowatt-hour', symbol: 'kWh', factor: 3600000 },
      { id: 'ev', name: 'Electronvolt', symbol: 'eV', factor: 1.60218e-19 },
      { id: 'btu', name: 'BTU', symbol: 'BTU', factor: 1055.06 },
      { id: 'ftlb', name: 'Foot-Pound', symbol: 'ft·lbf', factor: 1.35582 },
      { id: 'erg', name: 'Erg', symbol: 'erg', factor: 1e-7 },
    ],
    defaultFrom: 'kcal', defaultTo: 'kj',
  },
  {
    id: 'power', name: 'Power',
    units: [
      { id: 'w', name: 'Watt', symbol: 'W', factor: 1 },
      { id: 'kw', name: 'Kilowatt', symbol: 'kW', factor: 1000 },
      { id: 'mw', name: 'Megawatt', symbol: 'MW', factor: 1e6 },
      { id: 'hp', name: 'Horsepower', symbol: 'hp', factor: 745.7 },
      { id: 'ps', name: 'Metric Horsepower', symbol: 'PS', factor: 735.499 },
      { id: 'btuh', name: 'BTU/hour', symbol: 'BTU/h', factor: 0.293071 },
      { id: 'ftlbs', name: 'ft·lbf/s', symbol: 'ft·lbf/s', factor: 1.35582 },
    ],
    defaultFrom: 'kw', defaultTo: 'hp',
  },
  {
    id: 'frequency', name: 'Frequency',
    units: [
      { id: 'hz', name: 'Hertz', symbol: 'Hz', factor: 1 },
      { id: 'khz', name: 'Kilohertz', symbol: 'kHz', factor: 1000 },
      { id: 'mhz', name: 'Megahertz', symbol: 'MHz', factor: 1e6 },
      { id: 'ghz', name: 'Gigahertz', symbol: 'GHz', factor: 1e9 },
      { id: 'rpm', name: 'RPM', symbol: 'rpm', factor: 1 / 60 },
    ],
    defaultFrom: 'mhz', defaultTo: 'ghz',
  },
  {
    id: 'angle', name: 'Angle',
    units: [
      { id: 'deg', name: 'Degree', symbol: '°', factor: 1 },
      { id: 'rad', name: 'Radian', symbol: 'rad', factor: 180 / Math.PI },
      { id: 'grad', name: 'Gradian', symbol: 'gon', factor: 0.9 },
      { id: 'arcmin', name: 'Arcminute', symbol: '′', factor: 1 / 60 },
      { id: 'arcsec', name: 'Arcsecond', symbol: '″', factor: 1 / 3600 },
      { id: 'rev', name: 'Revolution', symbol: 'rev', factor: 360 },
    ],
    defaultFrom: 'deg', defaultTo: 'rad',
  },
  {
    id: 'fuel', name: 'Fuel Economy',
    units: [
      { id: 'kml', name: 'km/L', symbol: 'km/L', factor: 1 },
      { id: 'mpg', name: 'MPG (US)', symbol: 'mpg', factor: 0.425144 },
      { id: 'mpgimp', name: 'MPG (UK)', symbol: 'mpg(uk)', factor: 0.354006 },
      { id: 'l100', name: 'L/100km', symbol: 'L/100km' },
    ],
    custom: true,
    defaultFrom: 'kml', defaultTo: 'mpg',
  },
  {
    id: 'cooking', name: 'Cooking',
    units: [
      { id: 'cup', name: 'Cup', symbol: 'cup', factor: 236.588 },
      { id: 'tbsp', name: 'Tablespoon', symbol: 'tbsp', factor: 14.7868 },
      { id: 'tsp', name: 'Teaspoon', symbol: 'tsp', factor: 4.92892 },
      { id: 'ml', name: 'Milliliter', symbol: 'mL', factor: 1 },
      { id: 'l', name: 'Liter', symbol: 'L', factor: 1000 },
      { id: 'floz', name: 'Fluid Ounce', symbol: 'fl oz', factor: 29.5735 },
      { id: 'g', name: 'Gram', symbol: 'g', factor: 1 },
      { id: 'oz', name: 'Ounce', symbol: 'oz', factor: 28.3495 },
    ],
    defaultFrom: 'cup', defaultTo: 'ml',
  },
];

// ===== CONVERSION FUNCTIONS =====
function convertTemperature(value, from, to) {
  if (from === to) return value;
  // Convert to Celsius first
  let c;
  switch (from) {
    case 'c': c = value; break;
    case 'f': c = (value - 32) * 5 / 9; break;
    case 'k': c = value - 273.15; break;
    case 'r': c = (value - 491.67) * 5 / 9; break;
    default: c = value;
  }
  // Convert from Celsius to target
  switch (to) {
    case 'c': return c;
    case 'f': return c * 9 / 5 + 32;
    case 'k': return c + 273.15;
    case 'r': return (c + 273.15) * 9 / 5;
    default: return c;
  }
}

function convertFuel(value, from, to) {
  if (from === to) return value;
  // Normalize to km/L
  let kml;
  switch (from) {
    case 'kml': kml = value; break;
    case 'mpg': kml = value * 0.425144; break;
    case 'mpgimp': kml = value * 0.354006; break;
    case 'l100': kml = value === 0 ? 0 : 100 / value; break;
    default: kml = value;
  }
  // Convert from km/L to target
  switch (to) {
    case 'kml': return kml;
    case 'mpg': return kml / 0.425144;
    case 'mpgimp': return kml / 0.354006;
    case 'l100': return kml === 0 ? 0 : 100 / kml;
    default: return kml;
  }
}

function convert(value, fromUnit, toUnit, category) {
  if (!value && value !== 0) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';

  if (category.id === 'temperature') return convertTemperature(num, fromUnit, toUnit);
  if (category.id === 'fuel') return convertFuel(num, fromUnit, toUnit);

  const from = category.units.find(u => u.id === fromUnit);
  const to = category.units.find(u => u.id === toUnit);
  if (!from || !to) return '';

  // Convert via base unit: value * fromFactor / toFactor
  return (num * from.factor) / to.factor;
}

function formatResult(val) {
  if (val === '' || val === undefined) return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-10 && n !== 0)) return n.toExponential(6);
  // Smart rounding
  if (Number.isInteger(n)) return n.toLocaleString();
  const s = n.toPrecision(10);
  // Remove trailing zeros
  return parseFloat(s).toLocaleString(undefined, { maximumFractionDigits: 10 });
}

// ===== COMPONENT =====
function UnitConverter({ isOpen, onClose }) {
  const [activeCat, setActiveCat] = useState('length');
  const [selections, setSelections] = useState(() => {
    const init = {};
    CATEGORIES.forEach(c => {
      init[c.id] = { from: c.defaultFrom, to: c.defaultTo, value: '', direction: 'from' };
    });
    return init;
  });

  const category = useMemo(() => CATEGORIES.find(c => c.id === activeCat), [activeCat]);
  const state = selections[activeCat];

  const handleValueChange = useCallback((val, dir) => {
    setSelections(prev => ({
      ...prev,
      [activeCat]: { ...prev[activeCat], value: val, direction: dir },
    }));
  }, [activeCat]);

  const handleUnitChange = useCallback((unit, side) => {
    setSelections(prev => ({
      ...prev,
      [activeCat]: { ...prev[activeCat], [side]: unit },
    }));
  }, [activeCat]);

  const handleSwap = useCallback(() => {
    setSelections(prev => ({
      ...prev,
      [activeCat]: {
        ...prev[activeCat],
        from: prev[activeCat].to,
        to: prev[activeCat].from,
        direction: prev[activeCat].direction === 'from' ? 'to' : 'from',
      },
    }));
  }, [activeCat]);

  // Compute results
  const fromValue = state.direction === 'from' ? state.value : (() => {
    const r = convert(state.value, state.to, state.from, category);
    return r === '' ? '' : formatResult(r);
  })();
  const toValue = state.direction === 'to' ? state.value : (() => {
    const r = convert(state.value, state.from, state.to, category);
    return r === '' ? '' : formatResult(r);
  })();

  if (!isOpen) return null;

  return (
    <div className="uc-overlay" onClick={onClose}>
      <div className="uc-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="uc-header">
          <div className="uc-header-left">
            <svg className="uc-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span className="uc-header-title">Unit Converter</span>
            <span className="uc-header-count">{CATEGORIES.length} categories</span>
          </div>
          <button className="uc-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="uc-body">
          {/* Category Sidebar */}
          <div className="uc-sidebar">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                className={`uc-cat-btn${activeCat === c.id ? ' active' : ''}`}
                onClick={() => setActiveCat(c.id)}
              >
                <span className="uc-cat-icon">{ICONS[c.id]}</span>
                <span className="uc-cat-name">{c.name}</span>
              </button>
            ))}
          </div>

          {/* Converter Area */}
          <div className="uc-main">
            <div className="uc-converter">
              {/* From */}
              <div className="uc-field">
                <div className="uc-field-header">
                  <label className="uc-field-label">From</label>
                  <select
                    className="uc-select"
                    value={state.from}
                    onChange={e => handleUnitChange(e.target.value, 'from')}
                  >
                    {category.units.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                </div>
                <input
                  className="uc-input"
                  type="number"
                  value={state.direction === 'from' ? state.value : fromValue}
                  onChange={e => handleValueChange(e.target.value, 'from')}
                  placeholder="0"
                  autoFocus
                />
              </div>

              {/* Swap Button */}
              <button className="uc-swap-btn" onClick={handleSwap} title="Swap units">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>

              {/* To */}
              <div className="uc-field">
                <div className="uc-field-header">
                  <label className="uc-field-label">To</label>
                  <select
                    className="uc-select"
                    value={state.to}
                    onChange={e => handleUnitChange(e.target.value, 'to')}
                  >
                    {category.units.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                </div>
                <input
                  className="uc-input"
                  type="number"
                  value={state.direction === 'to' ? state.value : toValue}
                  onChange={e => handleValueChange(e.target.value, 'to')}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Formula Display */}
            {state.value && (
              <div className="uc-formula">
                {state.direction === 'from' ? state.value : fromValue}{' '}
                {category.units.find(u => u.id === state.from)?.symbol} ={' '}
                {state.direction === 'to' ? state.value : toValue}{' '}
                {category.units.find(u => u.id === state.to)?.symbol}
              </div>
            )}

            {/* Quick Reference Table */}
            <div className="uc-ref">
              <div className="uc-ref-title">Quick Reference</div>
              <div className="uc-ref-table">
                <div className="uc-ref-header">
                  <span>{category.units.find(u => u.id === state.from)?.symbol}</span>
                  <span>{category.units.find(u => u.id === state.to)?.symbol}</span>
                </div>
                {[1, 5, 10, 25, 50, 100, 500, 1000].map(v => {
                  const result = convert(v, state.from, state.to, category);
                  return (
                    <div key={v} className="uc-ref-row" onClick={() => handleValueChange(String(v), 'from')}>
                      <span>{v.toLocaleString()}</span>
                      <span>{formatResult(result)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UnitConverter;
