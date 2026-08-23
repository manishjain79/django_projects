from flask import Flask, render_template
app = Flask(__name__)

@app.route("/")
def index():
   return render_template("index.bak.html")

@app.route("/enterprise")
def enterprise():
   return render_template("enterprise.html")

@app.route("/government")
def goverment():
   return render_template("government.html")

@app.route("/channelpartner")
def channelpartner():
   return render_template("channelpartner.html")

@app.route("/midmarket")
def midmarket():
   return render_template("midmarket.html")

@app.route("/smallbusiness")
def smallbusiness():
   return render_template("smallbusiness.html")

if __name__ == '__main__':
   app.run(debug = True)