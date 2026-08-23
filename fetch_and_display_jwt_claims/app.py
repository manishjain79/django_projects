import jwt
from flask import Flask, render_template, request

app = Flask(__name__)


@app.route("/", methods=["GET", "POST"])
def index():
    claims = None
    error = None
    token = ""

    if request.method == "POST":
        token = request.form.get("token", "").strip()
        if token:
            try:
                # jwt.ms decodes tokens without verifying signatures
                claims = jwt.decode(token, options={"verify_signature": False})
            except Exception as e:
                error = f"Invalid JWT format: {str(e)}"

    return render_template("index.html", claims=claims, error=error, token=token)


if __name__ == "__main__":
    app.run()
