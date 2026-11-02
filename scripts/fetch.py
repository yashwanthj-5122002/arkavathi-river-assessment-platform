import json
from pathlib import Path

import requests


# ============================================================
# KIADB GIS CONFIGURATION
# ============================================================

BASE_URL = "https://kiadb.karnataka.gov.in/kiadbgisportal"

PORTAL_URL = f"{BASE_URL}/"

IDENTIFIER_URL = (
    f"{BASE_URL}/sulb.asmx/getdeatilsforidentifier"
)

PLOT_DETAILS_URL = (
    f"{BASE_URL}/sulb.asmx/getplotiisdetails"
)

# Test KIADB plot code
PLCD = "Z0752602360284"


# ============================================================
# CREATE SESSION
# ============================================================

session = requests.Session()

session.headers.update({
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json; charset=UTF-8",
    "Origin": "https://kiadb.karnataka.gov.in",
    "Referer": "https://kiadb.karnataka.gov.in/kiadbgisportal/",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/153.0.0.0 Safari/537.36"
    ),
})


# ============================================================
# ASP.NET RESPONSE PARSER
# ============================================================

def parse_asmx_response(response):
    """
    ASP.NET ASMX services frequently return:

        {
            "d": "..."
        }

    Sometimes the value inside 'd' is itself JSON encoded.
    This function unwraps it automatically.
    """

    response.raise_for_status()

    try:
        result = response.json()
    except ValueError:
        return response.text

    # ASP.NET ASMX wrapper
    if isinstance(result, dict) and "d" in result:
        result = result["d"]

    # Sometimes "d" contains JSON as a string
    if isinstance(result, str):
        cleaned = result.strip()

        try:
            return json.loads(cleaned)
        except (json.JSONDecodeError, TypeError):
            return cleaned

    return result


# ============================================================
# START KIADB SESSION
# ============================================================

def initialise_session():
    print("\nConnecting to KIADB GIS portal...")

    response = session.get(
        PORTAL_URL,
        timeout=30
    )

    response.raise_for_status()

    print("Portal status:", response.status_code)
    print("Session cookies:", session.cookies.get_dict())


# ============================================================
# API REQUEST
# ============================================================

def call_kiadb_api(url, plcd):

    payload = {
        "plcd": plcd
    }

    response = session.post(
        url,
        json=payload,
        timeout=30
    )

    print("\nURL:", url)
    print("HTTP status:", response.status_code)

    if response.status_code != 200:
        print("Response:")
        print(response.text[:1000])

    return parse_asmx_response(response)


# ============================================================
# KIADB FUNCTIONS
# ============================================================

def get_identifier_details(plcd):
    return call_kiadb_api(
        IDENTIFIER_URL,
        plcd
    )


def get_plot_details(plcd):
    return call_kiadb_api(
        PLOT_DETAILS_URL,
        plcd
    )


# ============================================================
# SAVE JSON
# ============================================================

def save_json(filename, data):

    Path("kiadb_output").mkdir(
        parents=True,
        exist_ok=True
    )

    path = Path("kiadb_output") / filename

    with open(
        path,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            data,
            f,
            indent=4,
            ensure_ascii=False
        )

    print("Saved:", path)


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    try:

        initialise_session()

        print("\n====================================")
        print("KIADB PLOT")
        print("====================================")
        print("PLCD:", PLCD)

        # ----------------------------------------------------
        # API 1
        # ----------------------------------------------------

        identifier_data = get_identifier_details(
            PLCD
        )

        print("\nIDENTIFIER DETAILS")
        print(
            json.dumps(
                identifier_data,
                indent=4,
                ensure_ascii=False
            )
            if not isinstance(identifier_data, str)
            else identifier_data
        )

        save_json(
            f"{PLCD}_identifier.json",
            identifier_data
        )

        # ----------------------------------------------------
        # API 2
        # ----------------------------------------------------

        plot_data = get_plot_details(
            PLCD
        )

        print("\nPLOT DETAILS")
        print(
            json.dumps(
                plot_data,
                indent=4,
                ensure_ascii=False
            )
            if not isinstance(plot_data, str)
            else plot_data
        )

        save_json(
            f"{PLCD}_plot_details.json",
            plot_data
        )

        print("\n====================================")
        print("KIADB FETCH COMPLETE")
        print("====================================")

    except requests.exceptions.RequestException as exc:

        print("\nKIADB REQUEST ERROR")
        print(exc)

    except Exception as exc:

        print("\nERROR")
        print(exc)