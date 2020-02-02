require('dotenv').config();
const puppeteer = require('puppeteer');
const express = require('express');
const request = require('request');
const cors = require('cors')

const app = express();
app.use(cors());

const port = process.env.PORT || 3000;
const {
  getLinkedinProfileDetails,
  setupScraper,
  checkIfLoggedIn
} = require('./scraper/linkedin');

console.log(`Server setup: Setting up...`);

(async () => {
  try {
    // Setup the headless browser before the requests, so we can re-use the Puppeteer session on each request
    // Resulting in fast scrapes because we don't have to launch a headless browser anymore
    const {
      page
    } = await setupScraper()

    // An endpoint to determine if the scraper is still loggedin into LinkedIn
    app.get('/status', async (req, res) => {
      const isLoggedIn = await checkIfLoggedIn(page)

      if (isLoggedIn) {
        res.json({
          status: 'success',
          message: 'Still logged in into LinkedIn.'
        })
      } else {
        res.json({
          status: 'fail',
          message: 'We are logged out of LinkedIn, or our logged in check is not working anymore.'
        })
      }
    })

    app.get('/', async (req, res) => {
      const urlToScrape = req.query.url

      if (urlToScrape && urlToScrape.includes('linkedin.com/')) {
        // TODO: this should be a worker process
        // We should send an event to the worker process and wait for an update
        // So this server can handle more concurrent connections
        const linkedinProfileDetails = await getLinkedinProfileDetails(page, urlToScrape);
        res.json({
          ...linkedinProfileDetails
        })
      } else {
        res.json({
          message: 'Missing the url parameter. Or given URL is not an LinkedIn URL.'
        })
      }
    })
  } catch (err) {
    console.log('Error during setup')
    console.log(err)

    app.get('/', async (req, res) => {
      res.json({
        message: 'An error occurred',
        error: (err.message) ? err.message : null
      })
    })
  }

  app.get('/pipefy', async (req, res) => {
    const nameToFind = req.query.name;
    console.log(nameToFind);
    var options = {
      method: 'POST',
      url: 'https://api.pipefy.com/graphql',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJ1c2VyIjp7ImlkIjo5MTQ0OTgsImVtYWlsIjoianVuaW9yLnNhcnRvcmlAZXpkZXZzLmNvbS5iciIsImFwcGxpY2F0aW9uIjo1NTk1OH19.hff1owAlgW9vFjU1zWVL47B6FJhkxrPkrvj66hE99Y938vDppA6WvW2I2vIvLX6YdOgBu8y2fOI9K7_mBqZUAw'
      },
      body: {
        query: '{ cards(pipe_id: 1102385, first: 10, search: {title: "' + nameToFind + '" }) { edges { node { title } } } }'
      },
      json: true,
      jar: 'JAR'
    };

    console.log(options.body.query);
    request(options, function (error, response, body) {
      if (error) {
        res.json({
          ...error
        });
      }

      res.json({
        ...body
      })
    });


  });


  app.listen(port, () => console.log(`Server setup: All done. Listening on port ${port}!`))

})()
