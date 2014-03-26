missing_episodes = {
    server: null,
    metadata_xml: null,

    init: function(metadata_xml, server, type) {
        missing_episodes.server = server;
        missing_episodes.metadata_xml = metadata_xml;

        if (type === "episodes") {
            missing_episodes.processEpisodes();
        }
        else if (type === "seasons") {
            missing_episodes.processSeasons();
        }
    },

    processEpisodes: function() {
        var directory_metadata = missing_episodes.metadata_xml.getElementsByTagName("MediaContainer")[0].getElementsByTagName("Directory")[0];
        var season_metadata_id = directory_metadata.getAttribute("ratingKey");
        var agent = directory_metadata.getAttribute("guid");
        var season_num = directory_metadata.getAttribute("index");

        var tvdb_id;
        // check if using the tvdb metadata agent
        if (/com\.plexapp\.agents\.thetvdb/.test(agent)) {
            tvdb_id = agent.match(/^com\.plexapp\.agents\.thetvdb:\/\/(\d+)\//)[1];
            debug("missing_episodes plugin: tvdb id found - " + tvdb_id);
        }
        // check if using the XBMCnfoTVImporter agent
        else if (/com\.plexapp\.agents\.xbmcnfotv/.test(agent)) {
            tvdb_id = agent.match(/^com\.plexapp\.agents\.xbmcnfotv:\/\/(\d+)\//)[1];
            debug("missing_episodes plugin: tvdb id found - " + tvdb_id);
        }
        else {
            debug("missing_episodes plugin: Agent is not tvdb. Aborting");
            return;
        }

        debug("missing_episodes plugin: Finding all present and all existing episodes");
        missing_episodes.getPresentEpisodes(season_metadata_id, function(present_episodes) {
            missing_episodes.getAllEpisodes(tvdb_id, season_num, function(all_episodes) {
                var tiles_to_insert = {};
                for (var i = 0; i < all_episodes.length; i++) {
                    var episode = all_episodes[i];
                    if (present_episodes.indexOf(episode["episode"]) === -1) {
                        var episode_tile = missing_episodes.createEpisodeTile(episode);
                        tiles_to_insert[episode["number"]] = episode_tile;
                    }
                }
                missing_episodes.insertSwitch();
                missing_episodes.insertEpisodeTiles(tiles_to_insert);
            });
        });
    },

    processSeasons: function() {
        var directory_metadata = missing_episodes.metadata_xml.getElementsByTagName("MediaContainer")[0].getElementsByTagName("Directory")[0];
        var show_metadata_id = directory_metadata.getAttribute("ratingKey");
        var agent = directory_metadata.getAttribute("guid");

        var tvdb_id;
        // check if using the tvdb metadata agent
        if (/com\.plexapp\.agents\.thetvdb/.test(agent)) {
            tvdb_id = agent.match(/^com\.plexapp\.agents\.thetvdb:\/\/(\d+)/)[1];
            debug("missing_episodes plugin: tvdb id found - " + tvdb_id);
        }
        // check if using the XBMCnfoTVImporter agent
        else if (/com\.plexapp\.agents\.xbmcnfotv/.test(agent)) {
            tvdb_id = agent.match(/^com\.plexapp\.agents\.xbmcnfotv:\/\/(\d+)/)[1];
            debug("missing_episodes plugin: tvdb id found - " + tvdb_id);
        }
        else {
            debug("missing_episodes plugin: Agent is not tvdb. Aborting");
            return;
        }

        debug("missing_episodes plugin: Finding all present and all existing seasons");
        missing_episodes.getPresentSeasons(show_metadata_id, function(present_seasons) {
            missing_episodes.getAllSeasons(tvdb_id, function(all_seasons) {
                var tiles_to_insert = {};
                for (var i = 0; i < all_seasons.length; i++) {
                    var season = all_seasons[i];
                    if (present_seasons.indexOf(season["season"]) === -1) {
                        if (season["season"] == 0) {
                            // ignore specials
                            continue;
                        }
                        var season_tile = missing_episodes.createSeasonTile(season);
                        tiles_to_insert[season["season"]] = season_tile;
                    }
                }
                missing_episodes.insertSwitch();
                missing_episodes.insertSeasonTiles(tiles_to_insert);
                // Fetch season air dates and insert them into tiles
                missing_episodes.insertSeasonAirdates(tvdb_id, tiles_to_insert);
            });
        });
    },

    getPresentEpisodes: function(season_metadata_id, callback) {
        debug("missing_episodes plugin: Fetching season episodes xml");
        var episodes_metadata_xml_url = "http://" + missing_episodes.server["address"] + ":" + missing_episodes.server["port"] + "/library/metadata/" + season_metadata_id + "/children?X-Plex-Token=" + missing_episodes.server["access_token"];
        utils.getXML(episodes_metadata_xml_url, true, function(episodes_metadata_xml) {
            var episodes_xml = episodes_metadata_xml.getElementsByTagName("MediaContainer")[0].getElementsByTagName("Video");
            var episodes = [];
            for (var i = 0; i < episodes_xml.length; i++) {
                episodes.push(parseInt(episodes_xml[i].getAttribute("index")));
            }
            callback(episodes);
        });
    },

    getPresentSeasons: function(show_metadata_id, callback) {
        debug("missing_episodes plugin: Fetching seasons xml");
        var seasons_metadata_xml_url = "http://" + missing_episodes.server["address"] + ":" + missing_episodes.server["port"] + "/library/metadata/" + show_metadata_id + "/children?X-Plex-Token=" + missing_episodes.server["access_token"];
        utils.getXML(seasons_metadata_xml_url, true, function(seasons_metadata_xml) {
            var seasons_xml = seasons_metadata_xml.getElementsByTagName("MediaContainer")[0].getElementsByTagName("Directory");
            var seasons = [];
            for (var i = 0; i < seasons_xml.length; i++) {
                var season_index = parseInt(seasons_xml[i].getAttribute("index"));
                if (!isNaN(season_index)) {
                    seasons.push(season_index);
                }
            }
            callback(seasons);
        });
    },

    getAllEpisodes: function(tvdb_id, season_num, callback) {
        debug("missing_episodes plugin: Reading API key");
        var api_key = utils.getApiKey("trakt");
        debug("missing_episodes plugin: Successfully read API key");

        var api_url = "http://api.trakt.tv/show/season.json/" + api_key + "/" + tvdb_id + "/" + season_num;
        utils.getJSON(api_url, true, function(trakt_json) {
            callback(trakt_json);
        });
    },

    getAllSeasons: function(tvdb_id, callback) {
        debug("missing_episodes plugin: Reading API key");
        var api_key = utils.getApiKey("trakt");
        debug("missing_episodes plugin: Successfully read API key");

        var api_url = "http://api.trakt.tv/show/seasons.json/" + api_key + "/" + tvdb_id;
        utils.getJSON(api_url, true, function(trakt_json) {
            callback(trakt_json);
        });
    },

    createEpisodeTile: function(episode) {
        var episode_tile = document.createElement("li");
        episode_tile.setAttribute("class", "poster-item media-tile-list-item episode missing-episode");

        var episode_tile_link = document.createElement("a");
        episode_tile_link.setAttribute("class", "media-poster-container");
        episode_tile_link.setAttribute("href", episode["url"]);
        episode_tile_link.setAttribute("target", "_blank");

        var episode_tile_poster = document.createElement("div");
        episode_tile_poster.setAttribute("class", "media-poster");
        episode_tile_poster.setAttribute("style", "background-image: url(" + episode["screen"] + ");");

        var episode_tile_overlay = document.createElement("div");
        episode_tile_overlay.setAttribute("class", "media-poster-overlay-missing-episode");

        var episode_title_overlay_text = document.createElement("div");
        episode_title_overlay_text.setAttribute("class", "overlay-missing-episode-text");
        var date_text;
        if (episode["first_aired"] === 0) {
            date_text = "TBA";
        }
        else {
            var d = new Date(episode["first_aired"] * 1000);
            date_text = d.toDateString();
            debug("missing_episodes plugin: Episode air date - " + d);
        }
        episode_title_overlay_text.innerHTML = "Air Date: " + date_text;

        var episode_tile_title = document.createElement("div");
        episode_tile_title.setAttribute("class", "media-title media-heading");
        episode_tile_title.innerHTML = episode["title"];

        var episode_tile_number = document.createElement("div");
        episode_tile_number.setAttribute("class", "media-subtitle media-heading secondary");
        episode_tile_number.innerHTML = "Episode " + episode["number"];

        episode_tile.appendChild(episode_tile_link);
        episode_tile_link.appendChild(episode_tile_poster);
        episode_tile_link.appendChild(episode_tile_title);
        episode_tile_link.appendChild(episode_tile_number);
        episode_tile_poster.appendChild(episode_tile_overlay);
        episode_tile_overlay.appendChild(episode_title_overlay_text);

        return episode_tile;
    },

    createSeasonTile: function(season) {
        var season_tile = document.createElement("li");
        season_tile.setAttribute("class", "poster-item media-tile-list-item season missing-season");

        var season_tile_link = document.createElement("a");
        season_tile_link.setAttribute("class", "media-poster-container");
        season_tile_link.setAttribute("href", season["url"]);
        season_tile_link.setAttribute("target", "_blank");

        var season_tile_poster = document.createElement("div");
        season_tile_poster.setAttribute("class", "media-poster");
        season_tile_poster.setAttribute("style", "background-image: url(" + season["poster"] + ");");

        var season_tile_overlay = document.createElement("div");
        season_tile_overlay.setAttribute("class", "media-poster-overlay-missing-season");

        var season_title_overlay_text = document.createElement("div");
        season_title_overlay_text.setAttribute("class", "overlay-missing-season-text");

        var season_tile_title = document.createElement("div");
        season_tile_title.setAttribute("class", "media-title media-heading");
        season_tile_title.innerHTML = "Season " + season["season"];

        var season_tile_number = document.createElement("div");
        season_tile_number.setAttribute("class", "media-subtitle media-heading secondary");
        season_tile_number.innerHTML = season["episodes"] + " episodes";

        season_tile.appendChild(season_tile_link);
        season_tile_link.appendChild(season_tile_poster);
        season_tile_link.appendChild(season_tile_title);
        season_tile_link.appendChild(season_tile_number);
        season_tile_poster.appendChild(season_tile_overlay);
        season_tile_overlay.appendChild(season_title_overlay_text);

        return season_tile;
    },

    insertEpisodeTiles: function(episode_tiles) {
        var episode_tile_list = document.getElementsByClassName("episode-tile-list")[0];
        var episode_tile_list_elements = episode_tile_list.getElementsByTagName("li");

        // remove episode tile list node first
        var parent_node = episode_tile_list.parentNode;
        parent_node.removeChild(episode_tile_list);

        for (var episode_number in episode_tiles) {
            var episode_tile = episode_tiles[episode_number];
            episode_number = parseInt(episode_number);
            if (episode_number === 1) {
                // insert into beginning of tile list
                episode_tile_list.insertBefore(episode_tile, episode_tile_list_elements[0]);
            }
            else {
                // insert after last episode tile
                try {
                    episode_tile_list.insertBefore(episode_tile, episode_tile_list_elements[episode_number-2].nextSibling);
                }
                // some seasons do not have consecutive episode numbers for some bizarre reason, so this is a hack fix
                catch(e) {
                    episode_tile_list.insertBefore(episode_tile, episode_tile_list_elements[episode_number-3].nextSibling);
                }
            }
        }

        // reinsert episode tile list node
        parent_node.appendChild(episode_tile_list);
    },

    insertSeasonTiles: function(season_tiles) {
        var season_tile_list = document.getElementsByClassName("season-tile-list")[0];
        var season_tile_list_elements = season_tile_list.getElementsByTagName("li");

        var first_season_tile = season_tile_list_elements[0].getElementsByClassName("media-title media-heading")[0].innerHTML;

        // remove season tile list node first
        var parent_node = season_tile_list.parentNode;
        parent_node.removeChild(season_tile_list);

        for (var season_number in season_tiles) {
            var season_tile = season_tiles[season_number];
            season_number = parseInt(season_number);
            if (season_number === 1) {
                // insert into beginning of tile list
                if (first_season_tile === "Specials") {
                    season_tile_list.insertBefore(season_tile, season_tile_list_elements[1]);
                }
                else {
                    season_tile_list.insertBefore(season_tile, season_tile_list_elements[0]);
                }
            }
            else {
                // insert after last season tile
                if (first_season_tile === "Specials") {
                    season_tile_list.insertBefore(season_tile, season_tile_list_elements[season_number-1].nextSibling);
                }
                else {
                    season_tile_list.insertBefore(season_tile, season_tile_list_elements[season_number-2].nextSibling);
                }
            }
        }

        // reinsert season tile list node
        parent_node.appendChild(season_tile_list);
    },

    insertSeasonAirdates: function(tvdb_id, season_tiles) {
        var season_tile_list = document.getElementsByClassName("season-tile-list")[0];
        var season_tile_list_elements = season_tile_list.getElementsByTagName("li");

        var first_season_tile = season_tile_list_elements[0].getElementsByClassName("media-title media-heading")[0].innerHTML;

        for (var season_number in season_tiles) {
            var season_tile = season_tiles[season_number];

            missing_episodes.getAllEpisodes(tvdb_id, season_number, function(all_episodes) {
                var first_episode = all_episodes[0];
                var air_date = first_episode["first_aired"];

                var date_text;
                if (air_date === 0) {
                    date_text = "TBA";
                }
                else {
                    var d = new Date(air_date * 1000);
                    date_text = d.toDateString();
                    debug("missing_episodes plugin: First episode air date - " + d);
                }

                var season_tile_element;
                if (first_season_tile === "Specials") {
                    season_tile_element = season_tile_list_elements[season_number];
                    }
                else {
                    season_tile_element = season_tile_list_elements[season_number-1];
                }
                var overlay_text_element = season_tile_element.getElementsByClassName("overlay-missing-season-text")[0];
                overlay_text_element.innerHTML = "Air Date:<br/>" + date_text;
            });
        }
    },

    insertSwitch: function() {
        var action_bar = document.getElementsByClassName("action-bar-nav")[0];
        var list_tag = document.createElement("li");

        var a_tag = document.createElement("a");
        a_tag.setAttribute("id", "missing-switch");

        var glyph = document.createElement("i");
        glyph.setAttribute("class", "glyphicon eye-open");

        a_tag.appendChild(glyph);
        list_tag.appendChild(a_tag);
        action_bar.appendChild(list_tag);

        a_tag.setAttribute("data-state", "show");
        a_tag.addEventListener("click", missing_episodes.switchState, false);
    },

    switchState: function() {
        var missing_switch = document.getElementById("missing-switch");
        var glyph = missing_switch.getElementsByTagName("i")[0];
        var state = missing_switch.getAttribute("data-state");

        var missing_episodes = document.getElementsByClassName("missing-episode");
        for (var i = 0; i < missing_episodes.length; i++) {
            if (state === "show") {
                missing_episodes[i].style.display = "none";
            }
            else {
                missing_episodes[i].style.display = "block";
            }
        }

        var missing_seasons = document.getElementsByClassName("missing-season");
        for (var i = 0; i < missing_seasons.length; i++) {
            if (state === "show") {
                missing_seasons[i].style.display = "none";
            }
            else {
                missing_seasons[i].style.display = "block";
            }
        }

        if (state === "show") {
            glyph.setAttribute("class", "glyphicon eye-close");
            missing_switch.setAttribute("data-state", "hide");
        }
        else {
            glyph.setAttribute("class", "glyphicon eye-open");
            missing_switch.setAttribute("data-state", "show");
        }
    }
}