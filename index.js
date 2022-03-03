require("dotenv").config();
const puppeteer = require("puppeteer");
const express = require("express");
const request = require("request");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);
app.use(bodyParser.json());

const port = process.env.PORT || 3000;
const {
  getLinkedinProfileDetails,
  setupScraper,
  checkIfLoggedIn
} = require("./scraper/linkedin");

const {
  setup,
  getData,
  getAllExperiences,
  getAllSkills
} = require("./scraper/methods");

console.log(`Server setup: Setting up...`);

(async () => {
  try {
    // Setup the headless browser before the requests, so we can re-use the Puppeteer session on each request
    // Resulting in fast scrapes because we don't have to launch a headless browser anymore
    const {
      page
    } = await setup();

    // An endpoint to determine if the scraper is still loggedin into LinkedIn
    app.get("/status", async (req, res) => {
      const isLoggedIn = await checkIfLoggedIn(page);

      if (isLoggedIn) {
        res.json({
          status: "success",
          message: "Still logged in into LinkedIn."
        });
      } else {
        res.json({
          status: "fail",
          message: "We are logged out of LinkedIn, or our logged in check is not working anymore."
        });
      }
    });

    app.get("/", async (req, res) => {
      const urlToScrape = req.query.url;
      console.log(urlToScrape);

      if (urlToScrape) {
        // TODO: this should be a worker process
        // We should send an event to the worker process and wait for an update
        // So this server can handle more concurrent connections

        let allExperiences = null;
        let allEducations = null;
        let allSkills = null;

        const { urlExperiences, urlEducations, urlSkills, ...remainingData } = await getData(
          page,
          urlToScrape
        );

        if(urlExperiences){
          allExperiences = await getAllExperiences('experience',page, urlExperiences);
        }

        if(urlEducations){
          allEducations = await getAllExperiences('education',page, urlEducations);
        }

        if(urlSkills){
          allSkills = await getAllSkills(page, urlSkills);
        }

        res.json({
          ...remainingData,
          experiences: urlExperiences ? allExperiences : remainingData.experiences,
          education: urlEducations ? allEducations : remainingData.education,
          skills: urlSkills ? allSkills : remainingData.skills
        });
      } else {
        res.json({
          message: "Missing the url parameter. Or given URL is not an LinkedIn URL."
        });
      }
    });
  } catch (err) {
    console.log("Error during setup");
    console.log(err);

    app.get("/", async (req, res) => {
      res.json({
        message: "An error occurred",
        error: err.message ? err.message : null
      });
    });
  }

  app.get("/pipefy", async (req, res) => {
    const nameToFind = req.query.name;
    var options = {
      method: "POST",
      url: "https://api.pipefy.com/graphql",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.PIPEFY_TOKEN}`
      },
      body: {
        query: "{ cards(pipe_id: " +
          process.env.PIPEFY_PIPE_ID +
          ', first: 10, search: {title: "' +
          nameToFind +
          '" }) { edges { node { title } } } }'
      },
      json: true
    };

    request(options, function (error, response, body) {
      if (error) {
        res.json({
          ...error
        });
      }

      res.json({
        ...body
      });
    });
  });

  app.post("/pipefy/create", async (req, res) => {
    const body = req.body;
    console.log(req);
    var options = {
      method: "POST",
      url: "https://api.pipefy.com/graphql",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.PIPEFY_TOKEN}`
      },
      body: {
        query: "mutation{ createCard(input: {pipe_id: " +
          process.env.PIPEFY_PIPE_ID +
          ' fields_attributes: [ {field_id: "nome", field_value: "' +
          body.name +
          '"} {field_id: "linkedin", field_value: "' +
          body.linkedin +
          '"}]}) { card {id title }}}'
      },
      json: true
    };

    request(options, function (error, response, body) {
      if (error) {
        res.json({
          ...error
        });
      }

      res.json({
        ...body
      });
    });
  });

  app.listen(port, () =>
    console.log(`Server setup: All done. Listening on port ${port}!`)
  );
})();
