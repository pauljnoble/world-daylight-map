require('../stylus/_all.styl');

import $ from 'jquery';
import d3 from 'd3';
import projections from 'd3-geo-equirectangular';
import topojson from 'topojson';
import SunCalc from 'SunCalc';
import moment from 'moment';

class DaylightMap {

    constructor (svg, date, options) {
        if (!(SunCalc) || !($) || !(d3)) {
            throw new Error("Unmet dependency (requires d3.js, jQuery, SunCalc)");
        }

        if (!(svg instanceof SVGElement)) {
            throw new TypeError("DaylightMap must be instantiated with an SVG element");
        }

        this.svg = svg;
        this.currDate = date || new Date();
        this.options = {};

        this.defaults = {
            tickDur: 400,
            shadowOpacity: 0.16,
            lightsOpacity: 0.5,
            sunOpacity: 0.11,
            precisionLat: 1, // How many latitudinal degrees per point when checking solar position.
            precisionLng: 10, // How may longitudial degrees per sunrise / sunset path point.
            mapWidth: 1100,
            mapHeight: 550,
            refreshMap: true, // Periodically redraw map to keep current time
            refreshMapInterval: 60000, // Update interval
            bgColorLeft: '#42448A',
            bgColorRight: '#376281',
            lightsColor: '#FFBEA0',
            worldPaths: '/world-daylight-map/build/assets/world-110m.json',
            citiesDataPath: '/world-daylight-map/build/assets/cities-200000.json'
        };

        this.options = $.extend({}, this.defaults, options);
        this.scalarX = (this.options.mapWidth / 360);
        this.scalarY = (this.options.mapHeight / 180);
        this.projectionScale = (this.options.mapWidth / 6.25);
        this.isAnimating = false;
        this.cities = [];
        this.animInterval = null;
        this.init();
    }

    /*
     * Utility method for altering color luminance.
     */

    colorLuminance (hex, lum = 0) {
        let c = null;
        let i = 0;
        let rgb = '#';
        hex = String(hex).replace(/[^0-9a-f]/gi, '');
        if (hex.length < 6)
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];

        while (i < 3) {
            c = parseInt(hex.substr(i * 2, 2), 16);
            c = Math.round(Math.min(Math.max(0, c + c * lum), 255)).toString(16);
            rgb += ('00' + c).substr(c.length);
            i++;
        }
        return rgb;
    }

    isDaylight (obj) {
        return (obj.altitude > 0);
    }

    isNorthSun () {
        return this.isDaylight(SunCalc.getPosition(this.currDate, 90, 0));
    }

    getSunriseSunsetLatitude (lng, northSun) {
        let delta, endLat, lat, startLat;
        if (northSun) {
            startLat = -90;
            endLat = 90;
            delta = this.options.precisionLat;
        } else {
            startLat = 90;
            endLat = -90;
            delta = -this.options.precisionLat;
        }
        lat = startLat;

        while (lat !== endLat) {
            if (this.isDaylight(SunCalc.getPosition(this.currDate, lat, lng))) {
                return lat;
            }
            lat += delta;
        }
        return lat;
    }

    getAllSunPositionsAtLng (lng) {
        let alt, lat, peak, result;
        lat = -90;
        peak = 0;
        result = [];
        while (lat < 90) {
            alt = SunCalc.getPosition(this.currDate, lat, lng).altitude;
            if (alt > peak) {
                peak = alt;
                result = [peak, lat];
            }
            lat += this.options.precisionLng;
        }
        return result;
    }

    getSunPosition () {
        let alt, coords, lng, peak, result;
        lng = -180;
        coords = [];
        peak = 0;
        while (lng < 180) {
            alt = this.getAllSunPositionsAtLng(lng);
            if (alt[0] > peak) {
                peak = alt[0];
                result = [alt[1], lng];
            }
            lng += this.options.precisionLat;
        }
        return this.coordToXY(result);
    }

    getAllSunriseSunsetCoords (northSun) {
        let lng = -180;
        let coords = [];
        while (lng <= 180) {
            coords.push([this.getSunriseSunsetLatitude(lng, northSun), lng]);
            lng += this.options.precisionLng;
        }
        return coords;
    }

    coordToXY (coord) {
        const x = (coord[1] + 180) * this.scalarX;
        const y = this.options.mapHeight - (coord[0] + 90) * this.scalarY;
        return { x: x, y: y };
    }

    getCityOpacity (coord) {
        if (SunCalc.getPosition(this.currDate, coord[0], coord[1]).altitude > 0) {
            return 0;
        }
        return 1;
    }

    getCityRadius (p) {
        if (p < 200000) return 0.3;
        if (p < 500000) return 0.4;
        if (p < 100000) return 0.5;
        if (p < 2000000) return 0.6;
        if (p < 4000000) return 0.8;
        return 1;
    }
    
    getPath (northSun) {
        const path = [];
        const coords = this.getAllSunriseSunsetCoords(northSun);
        coords.forEach((val) => {
            return path.push(this.coordToXY(val));
        });
        return path;
    }

    getPathString (northSun) {
        const path = this.getPath(northSun);
        const yStart = (northSun) ? this.options.mapHeight : 0;
        const lineFunction = d3.svg.line().x(function(d) { return d.x; }).y(function(d) { return d.y; }).interpolate('basis');
        return `M 0 ${yStart} ${lineFunction(path)} L  ${this.options.mapWidth}, ${yStart} L 0, ${yStart} `;
    }

    createDefs () {
        d3.select(this.svg)
            .append('defs')
            .append('linearGradient')
            .attr('id', 'gradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '0%');

        d3.select('#gradient')
            .append('stop')
            .attr('offset', '0%')
            .attr('stop-color', this.options.bgColorLeft);

        d3.select('#gradient')
            .append('stop')
            .attr('offset', '100%')
            .attr('stop-color', this.options.bgColorRight);

        d3.select(this.svg)
            .select('defs')
            .append('linearGradient')
            .attr('id', 'landGradient')
            .attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '0%');

        d3.select('#landGradient')
            .append('stop')
            .attr('offset', '0%')
            .attr('stop-color', this.colorLuminance(this.options.bgColorLeft, -0.2));

        d3.select('#landGradient')
            .append('stop')
            .attr('offset', '100%')
            .attr('stop-color', this.colorLuminance(this.options.bgColorRight, -0.2));

        d3.select(this.svg)
            .select('defs')
            .append('radialGradient')
            .attr('id', 'radialGradient');

        d3.select('#radialGradient')
            .append('stop')
            .attr('offset', '0%')
            .attr('stop-opacity', this.options.sunOpacity)
            .attr('stop-color', "rgb(255, 255, 255)");
            
        d3.select('#radialGradient')
            .append('stop')
            .attr('offset', '100%')
            .attr('stop-opacity', 0)
            .attr('stop-color', 'rgb(255, 255, 255)');
    }

    drawSVG () {
        d3.select(this.svg)
            .attr('width', this.options.mapWidth)
            .attr('height', this.options.mapHeight)
            .attr('viewBox', `0 0  ${this.options.mapWidth} ${this.options.mapHeight}`)
            .append('rect')
            .attr('width', this.options.mapWidth)
            .attr('height', this.options.mapHeight)
            .attr('fill', 'url(#gradient)');
    }

    drawSun () {
        const xy = this.getSunPosition();

        d3.select(this.svg)
            .append('circle')
            .attr('cx', xy.x)
            .attr('cy', xy.y)
            .attr('id', 'sun')
            .attr('r', 150)
            .attr('opacity', 1)
            .attr('fill', 'url(#radialGradient)');
    }

    drawPath () {
        const path = this.getPathString(this.isNorthSun());
        d3.select(this.svg)
            .append('path')
            .attr('id', 'nightPath')
            .attr('fill', "rgb(0,0,0)")
            .attr('fill-opacity', this.options.shadowOpacity)
            .attr('d', path);
    }

    drawLand () {
        d3.json(this.options.worldPaths, (data) => {
            let projection, worldPath;

            projection = d3.geo.equirectangular()
                .scale(this.projectionScale)
                .translate([this.options.mapWidth / 2, this.options.mapHeight / 2])
                .precision(0.1);

            worldPath = d3.geo.path().projection(projection);

            d3.select(this.svg)
                .append('path')
                .attr('id', 'land')
                .attr('fill', 'url(#landGradient)')
                .datum(topojson.feature(data, data.objects.land))
                .attr('d', d3.geo.path().projection(projection));

            this.shuffleElements();
        });
    }

    drawCities () {
        $.get(this.options.citiesDataPath, (data) => {

            data.forEach((val, i) => {
                const coords = [parseFloat(val[2]), parseFloat(val[3])];
                const xy = this.coordToXY(coords);
                const id = `city${i}`;
                const opacity = this.getCityOpacity(coords);
                const radius = this.getCityRadius(val[0]);
                
                d3.select(this.svg)
                    .append('circle')
                    .attr('cx', xy.x)
                    .attr('cy', xy.y)
                    .attr('id', id)
                    .attr('r', radius)
                    .attr('opacity', opacity * this.options.lightsOpacity)
                    .attr('fill', this.options.lightsColor);

                this.cities.push({
                    title: val[1],
                    country: val[5],
                    latlng: coords,
                    xy: xy,
                    population: parseInt(val[0]),
                    id: id,
                    opacity: opacity
                });
            });
        });
    }

    redrawSun (animate) {
        const xy = this.getSunPosition();
        const curX = parseInt(d3.select("#sun").attr('cx'));

        if (animate && ((Math.abs(xy.x - curX)) < (this.options.mapWidth * 0.8))) {
            return d3.select("#sun")
                .transition()
                .duration(this.options.tickDur)
                .ease('linear')
                .attr('cx', xy.x)
                .attr('cy', xy.y);
        }
        
        return d3.select("#sun")
            .attr('cx', xy.x)
            .attr('cy', xy.y);
    }

    redrawCities () {
        let k = 0;
        this.cities.forEach((val, i) => {
            let opacity = this.getCityOpacity(val.latlng);
            if (val.opacity !== opacity) {
                this.cities[i].opacity = opacity;
                k++;
                d3.select(`#${val.id}`)
                    .transition()
                    .duration(this.options.tickDur * 2)
                    .attr('opacity', this.options.lightsOpacity * opacity);
            }

        });
    }

    redrawPath (animate) {
        let nightPath, path;
        path = this.getPathString(this.isNorthSun(this.currDate));
        nightPath = d3.select('#nightPath');

        if (animate) {
            return nightPath.transition()
                .duration(this.options.tickDur)
                .ease('linear')
                .attr('d', path);
        }

        return nightPath.attr('d', path);
    }

    redrawAll (increment = 15, animate = true) {
        this.currDate.setMinutes(this.currDate.getMinutes() + increment);
        this.redrawPath(animate);
        this.redrawSun(animate);
        this.redrawCities();
    }

    drawAll () {
        this.drawSVG();
        this.createDefs();
        this.drawLand();
        this.drawPath();
        this.drawSun();
        this.drawCities();
    }

    shuffleElements () {
        $('#land').insertBefore('#nightPath');
        return $('#sun').insertBefore('#land');
    }

    animate (increment = 0) {

        if (!this.isAnimating) {
            this.isAnimating = true;
            
            this.animInterval = setInterval(() => {
                this.redrawAll(increment);
                $(document).trigger('update-date-time', this.currDate);
            }, this.options.tickDur);
        }
    }

    stop () {
        this.isAnimating = false;
        clearInterval(this.animInterval);
    }

    init () {
        this.drawAll();
        setInterval(() => {
            if (this.isAnimating) return;
            if (!(this.refreshMap)) return;
            this.redrawAll(1, false);
            $(document).trigger('update-date-time', this.currDate);
        }, this.options.refreshMapInterval);
    }
        
    // searchCities (str) {
    //     cities = _.filter(this.cities, (val) => { val.title.toLowerCase().indexOf(str) === 0});
    //     cities = _.sortBy(cities, (val) => { val.population });
    //     cities.reverse();
    // } 
}


function updateDateTime (date) {
    var tz = date.toString().match(/\(([A-Za-z\s].*)\)/)[1];
    $('.curr-time').find('span').html(moment(date).format("HH:mm") + ' <span>' + tz + '</span>');
    $('.curr-date').find('span').text(moment(date).format("DD MMM"));
}


$(document).ready(function() {
    var map, svg;
    svg = document.getElementById('daylight-map');
    map = new DaylightMap(svg, new Date());

    updateDateTime(map.currDate);

    $(document).on('update-date-time', function(date) {
        return updateDateTime(map.currDate);
    });

    $('.toggle-btn').on('click', function(e) {
        var $el;
        e.preventDefault();
        $el = $(this);
        return $el.toggleClass('active');
    });

    $('.js-skip').on('click', function(e) {
        var $el, animate;
        e.preventDefault();
        $el = $(this);
        animate = false;
        map.stop();
        $('.js-animate').removeClass('animating');
        if ($el.attr('data-animate')) {
            animate = true;
        }
        map.redrawAll(parseInt($(this).attr('data-skip')), animate);
        return updateDateTime(map.currDate);
    });

    $('.js-animate').on('click', function(e) {
        var $el;
        $el = $(this);
        e.preventDefault();
        if ($el.hasClass('animating')) {
            $el.removeClass('animating');
            return map.stop();
        } else {
            $el.addClass('animating');
            return map.animate(10);
        }
    });

});
