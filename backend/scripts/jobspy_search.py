"""Bridge used by the Indeed source: runs one JobSpy search and prints the jobs as JSON on stdout.

Usage: python jobspy_search.py '<json arguments>'
Only Indeed is queried, one page, a small result count, no login and no proxies.
Exit code 3 means python-jobspy is not installed; any other failure prints a message on stderr.
"""
import json
import sys
import warnings

warnings.filterwarnings("ignore")

try:
    from jobspy import scrape_jobs
except Exception as exc:  # not installed, or broken numpy/pandas
    sys.stderr.write(f"jobspy unavailable: {exc}\n")
    sys.exit(3)

args = json.loads(sys.argv[1])
term = args["keyword"].strip()
# Indeed pads an unquoted search with unrelated promoted jobs; a quoted phrase returns matching titles only.
if not any(ch in term for ch in '"():'):
    term = '"' + term + '"'
kwargs = dict(
    site_name=["indeed"],
    search_term=term,
    location=args.get("location") or None,
    country_indeed=args.get("country") or "Qatar",
    results_wanted=int(args.get("limit") or 20),
    description_format="markdown",
    verbose=0,
)
if args.get("hoursOld"):
    kwargs["hours_old"] = int(args["hoursOld"])
if args.get("jobType"):
    kwargs["job_type"] = args["jobType"]
if args.get("remote"):
    kwargs["is_remote"] = True

df = scrape_jobs(**kwargs)
cols = ["id", "job_url", "job_url_direct", "title", "company", "location", "date_posted", "job_type", "is_remote", "emails", "description"]
df = df[[c for c in cols if c in df.columns]]
sys.stdout.write(df.to_json(orient="records", date_format="iso", force_ascii=False))
