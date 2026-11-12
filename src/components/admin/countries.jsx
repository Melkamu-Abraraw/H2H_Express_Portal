// Countries a route can start or end in. Add a line here to offer another one.

import AE from "country-flag-icons/react/3x2/AE";
import CA from "country-flag-icons/react/3x2/CA";
import DE from "country-flag-icons/react/3x2/DE";
import DJ from "country-flag-icons/react/3x2/DJ";
import ER from "country-flag-icons/react/3x2/ER";
import ET from "country-flag-icons/react/3x2/ET";
import GB from "country-flag-icons/react/3x2/GB";
import GH from "country-flag-icons/react/3x2/GH";
import KE from "country-flag-icons/react/3x2/KE";
import NG from "country-flag-icons/react/3x2/NG";
import RW from "country-flag-icons/react/3x2/RW";
import SA from "country-flag-icons/react/3x2/SA";
import SD from "country-flag-icons/react/3x2/SD";
import SO from "country-flag-icons/react/3x2/SO";
import SS from "country-flag-icons/react/3x2/SS";
import TZ from "country-flag-icons/react/3x2/TZ";
import UG from "country-flag-icons/react/3x2/UG";
import US from "country-flag-icons/react/3x2/US";
import ZA from "country-flag-icons/react/3x2/ZA";

const LIST = [
  ["CA", "Canada", "CAD", CA],
  ["DJ", "Djibouti", "DJF", DJ],
  ["ER", "Eritrea", "ERN", ER],
  ["ET", "Ethiopia", "ETB", ET],
  ["DE", "Germany", "EUR", DE],
  ["GH", "Ghana", "GHS", GH],
  ["KE", "Kenya", "KES", KE],
  ["NG", "Nigeria", "NGN", NG],
  ["RW", "Rwanda", "RWF", RW],
  ["SA", "Saudi Arabia", "SAR", SA],
  ["SO", "Somalia", "SOS", SO],
  ["ZA", "South Africa", "ZAR", ZA],
  ["SS", "South Sudan", "SSP", SS],
  ["SD", "Sudan", "SDG", SD],
  ["TZ", "Tanzania", "TZS", TZ],
  ["UG", "Uganda", "UGX", UG],
  ["AE", "United Arab Emirates", "AED", AE],
  ["GB", "United Kingdom", "GBP", GB],
  ["US", "United States", "USD", US],
];

export const COUNTRIES = Object.fromEntries(
  LIST.map(([code, name, currency, Flag]) => [code, { code, name, currency, Flag }]),
);

export const COUNTRY_LIST = Object.values(COUNTRIES);

export const CURRENCIES = [...new Set(LIST.map(([, , currency]) => currency))].sort();
