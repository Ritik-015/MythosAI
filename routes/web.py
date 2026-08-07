from flask import render_template


def register_routes(app):

    @app.route("/")
    def index():
        return render_template("index.html")