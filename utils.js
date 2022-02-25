const moment = require('moment');
const textMiner = require('text-miner');

const formatDate = (date) => {
  let formattedDate
  // date = "Present", "2018", "Dec 2018"
  if (date === 'Present') {
    formattedDate = moment().format()
  } else {
    formattedDate = moment(date, 'MMMY').format()
  }

  return formattedDate
}

const getDurationInDays = (formattedStartDate, formattedEndDate) => {
  if (!formattedStartDate || !formattedEndDate) return null
  // +1 to include the start date
  return moment(formattedEndDate).diff(moment(formattedStartDate), 'days') + 1
}

const getLocationFromText = async (text) => {
  // Text is something like: Amsterdam Area, Netherlands

  if (!text) return null

  const cleanText = text.replace(' Area', '')

  const city = (cleanText) ? cleanText.split(', ')[0] : null
  const country = (cleanText) ? cleanText.split(', ')[1] : null

  return {
    city,
    country
  }
}

const getCleanText = async (text) => {
  const regexRemoveMultipleSpaces = / +/g
  const regexRemoveLineBreaks = /(\r\n\t|\n|\r\t)/gm

  if (!text) return null

  const cleanText = text
    .replace(regexRemoveLineBreaks, '')
    .replace(regexRemoveMultipleSpaces, ' ')
    .replace('...', '')
    .replace('See more', '')
    .replace('See less', '')
    .trim()

  return cleanText
}

const isPeriod = (type, text) => {

  if (type === 'experience') {
    const words = ['mês', 'ano', 'anos', 'meses', 'anos', 'momento'];
    const excludeWords = ['Temporário'];

    return words.filter(word => text.indexOf(word) !== -1 && !excludeWords.includes(word)).length !== 0;
  }else if (type === 'education'){
    const words = ['-'];

    return words.filter(word => text.indexOf(word) !== -1).length !== 0;
  }

  return false;
}

const returnDetailsByExperience = (type, array) => {

  if (type === 'experience') {

    if (array.length === 1) {
      const [item] = array;

      return isPeriod(item) ? { period: item } : { company: item };
    } else if (array.length === 2) {

      const [first, second] = array;

      if (isPeriod(first)) {

        return { period: first, location: second }
      } else if (isPeriod(second)) {

        return { company: first, period: second }
      } else {

        return { company: first, location: second }
      }
    } else if (array.length === 3) {

      const [first, second, third] = array;

      return { company: first, period: second, location: third }
    }
  }else if (type === 'education') {
    if (array.length === 1) {
      const [item] = array;

      return isPeriod(type, item) ? { period: item } : { company: item };
    } else {
      const [first, second] = array;

      return { company: first, period: second }
    }
  }

  return null;
}

module.exports = {
  formatDate,
  getDurationInDays,
  getCleanText,
  getLocationFromText,
  isPeriod,
  returnDetailsByExperience
}
