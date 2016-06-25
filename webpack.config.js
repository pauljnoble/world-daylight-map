var Webpack = require('webpack');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var CopyWebpackPlugin = require('copy-webpack-plugin');
var path = require('path');
var buildPath = path.resolve(__dirname, './', 'build');
var mainPath = path.resolve(__dirname, 'js', 'index.js');

module.exports = {
    entry: [mainPath],
    output: {
        path: buildPath,
        filename: 'js/bundle.js',
        publicPath: '/'
    },
    module: {
        loaders: [
            {
                test: /\.js$/,
                exclude: /(node_modules)/,
                loader: "babel-loader",
                query: {
                    presets: ['es2015'],
                }
            },
            {
                test: /\.styl$/,
                loader: ExtractTextPlugin.extract("style-loader", "css-loader!stylus-loader")
            }
        ]
    },
    plugins: [
        new Webpack.HotModuleReplacementPlugin(),
         new ExtractTextPlugin("css/[name].css"),
         new CopyWebpackPlugin([
            { from: './index.html', to:  buildPath + '/index.html' },
            { from: './assets/**/*', to:  buildPath }
        ])
    ]
};
