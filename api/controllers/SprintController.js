/**
 * SprintController
 *
 * @module      ::  Controller
 * @description ::  Contains logic for handling requests.
 */
var jQuery = require("jquery");
var async = require("async");

module.exports = {
    /**
     * Sprint add action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    add: function(req, res) {
        var projectId = parseInt(req.param("projectId"), 10);

        res.view({
            layout: req.isAjax ? "layout_ajax" : "layout",
            projectId: projectId
        });

    },

    /**
     * Sprint edit action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    edit: function(req, res) {
        var sprintId = parseInt(req.param("id"), 10);

        async.parallel(
            {
                // Fetch single sprint data
                sprint: function(callback) {
                    DataService.getSprint(sprintId, callback);
                },

                // Determine user role in this sprint
                role: function(callback) {
                    AuthService.hasSprintAccess(req.user, sprintId, callback, true);
                }
            },
            function (error, data) {
                if (error) {
                    res.send(error, error.status ? error.status : 500);
                } else {
                    data.layout = req.isAjax ? "layout_ajax" : "layout";
                    data.currentUser = req.user;

                    res.view(data);
                }
            }
        );
    },

    /**
     * Sprint backlog action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    backlog: function(req, res) {
        var sprintId = parseInt(req.param("id"), 10);

        var data = {
            layout: req.isAjax ? "layout_ajax" : "layout",
            stories: false,
            role: 0,
            sprint: {
                data: false,
                progressStory: 0,
                progressTask: 0,
                cntStoryDone: 0,
                cntStoryNotDone: 0,
                cntStoryTotal: 0,
                cntTaskDone: 0,
                cntTaskNotDone: 0,
                cntTaskTotal: 0
            }
        };

        async.parallel(
            {
                // Fetch sprint data.
                sprint: function(callback) {
                    DataService.getSprint(sprintId, callback);
                },

                // Fetch sprint stories data.
                stories: function(callback) {
                    DataService.getStories({sprintId: sprintId}, callback);
                },

                // Determine user role in this sprint
                role: function(callback) {
                    AuthService.hasSprintAccess(req.user, sprintId, callback, true);
                }
            },

            /**
             * Callback function which is been called after all parallel jobs are processed.
             *
             * @param   {Error|String}  error
             * @param   {{}}            results
             */
            function(error, results) {
                if (error) {
                    res.send(error, error.status ? error.status : 500);
                } else {
                    data.sprint.data = results.sprint;
                    data.stories = results.stories;
                    data.role = results.role;

                    fetchTaskData();
                }
            }
        );

        /**
         * Function to fetch task data for each story
         *
         * @return  void
         */
        function fetchTaskData() {
            // We have no stories, so make view
            if (data.stories.length === 0) {
                makeView();
            } else {
                data.sprint.cntStoryTotal = data.stories.length;
                data.sprint.cntStoryDone = _.reduce(data.stories, function(memo, story) { return (story.isDone) ? memo + 1 : memo; }, 0);
                data.sprint.cntStoryNotDone = data.sprint.cntStoryTotal - data.sprint.cntStoryDone;

                if (data.sprint.cntStoryDone > 0) {
                    data.sprint.progressStory = Math.round(data.sprint.cntStoryDone / data.sprint.cntStoryTotal * 100);
                } else {
                    data.sprint.progressStory = 0;
                }

                // Iterate stories
                jQuery.each(data.stories, function(key, /** sails.model.story */story) {
                    // Initialize story tasks property
                    story.tasks = false;

                    // Find all tasks which are attached to current user story
                    Task
                        .find()
                        .where({
                            storyId: story.id
                        })
                        .sort("title ASC")
                        .done(function(error, tasks) {
                            // Add tasks to story data
                            story.tasks = tasks;
                            story.doneTasks = _.reduce(tasks, function(memo, task) { return (task.isDone) ? memo + 1 : memo; }, 0);

                            if (story.doneTasks > 0) {
                                story.progress = Math.round(story.doneTasks / tasks.length * 100);
                            } else {
                                story.progress = 0;
                            }

                            // Add task counts to sprint
                            data.sprint.cntTaskTotal += story.tasks.length;
                            data.sprint.cntTaskDone += story.doneTasks;

                            // Call view
                            makeView();
                        });
                });
            }
        }

        /**
         * Function to make actual view for sprint backlog.
         */
        function makeView() {
            if (data.stories.length > 0) {
                var show = true;

                // Check that we all tasks for story
                jQuery.each(data.stories, function(key, /** sails.model.story */story) {
                    // All tasks are not yet fetched
                    if (story.tasks === false) {
                        show = false;
                    }
                });

                if (show) {
                    data.sprint.cntTaskNotDone = data.sprint.cntTaskTotal - data.sprint.cntTaskDone;

                    if (data.sprint.cntTaskDone > 0) {
                        data.sprint.progressTask = Math.round(data.sprint.cntTaskDone / data.sprint.cntTaskTotal * 100);
                    } else {
                        data.sprint.progressTask = 0;
                    }

                    res.view(data);
                }
            } else {
                res.view(data);
            }
        }
    },

    /**
     * Sprint charts action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    charts: function(req, res) {
        var sprintId = parseInt(req.param("id"), 10);

        var data = {
            layout: req.isAjax ? "layout_ajax" : "layout"
        };

        // Get sprint and attached stories data
        async.parallel(
            {
                // Fetch sprint data
                sprint: function(callback) {
                    DataService.getSprint(sprintId, callback);

                },

                // Fetch stories that are attached to this sprint
                stories: function(callback) {
                    DataService.getStories({sprintId: sprintId}, callback);
                }
            },
            function(error, results) {
                if (error) {
                    res.send(500, error);
                } else {
                    // Store results to data
                    data.sprint = results.sprint;
                    data.stories = results.stories;

                    // Determine story id values for task search.
                    var storyIds = _.map(data.stories, function(story) { return {storyId: story.id}; });

                    // Fetch stories tasks
                    DataService.getTasks({or: storyIds}, function(error, tasks) {
                        if (error) {
                            res.send(500, error);
                        } else {
                            data.tasks = tasks;

                            makeView();
                        }
                    });
                }
            }
        );

        function makeView() {
            res.view(data);
        }
    },

    /**
     * Sprint chartDataTask action.
     *
     * @param   {Request}   req Request object
     * @param   {Response}  res Response object
     */
    chartDataTasks: function(req, res) {
        var sprintId = parseInt(req.param("sprintId"), 10);

        var data = {};

        // Get sprint and attached stories data
        async.parallel(
            {
                // Fetch sprint data
                sprint: function(callback) {
                    DataService.getSprint(sprintId, callback);

                },

                // Fetch stories that are attached to this sprint
                stories: function(callback) {
                    DataService.getStories({sprintId: sprintId}, callback);
                }
            },
            function(error, results) {
                if (error) {
                    res.send(500, error);
                } else {
                    // Store results to data
                    data.sprint = results.sprint;
                    data.stories = results.stories;

                    // Determine story id values for task search.
                    var storyIds = _.map(data.stories, function(story) { return {storyId: story.id}; });

                    // Fetch story tasks
                    DataService.getTasks({or: storyIds}, function(error, tasks) {
                        if (error) {
                            res.send(500, error);
                        } else {
                            data.tasks = tasks;

                            parseData();
                        }
                    });
                }
            }
        );

        /**
         * Private function to parse actual data.
         */
        function parseData() {
            var initTasks = 0;
            var storyTasks = 0;
            var tasksOver = [];

            // Iterate each stories and determine initial and "over" tasks
            _.each(data.stories, function(story) {
                storyTasks = 0;

                // Story has not yet started, so all of its tasks are in "init" data
                if (!(story.timeStart && story.timeStart != '0000-00-00 00:00:00')) {
                    storyTasks = _.size(_.filter(data.tasks, function(task) {
                        return task.storyId === story.id;
                    }));
                } else { // Otherwise story is either in process or done
                    // calculate task count that are created before story start time
                    storyTasks = _.size(_.filter(data.tasks, function(task) {
                        return (task.storyId === story.id && task.createdAt <= story.timeStart);
                    }));

                    // Determine tasks that are added after story start
                    tasksOver = tasksOver.concat(_.filter(data.tasks, function(task) {
                        return (task.storyId === story.id && task.createdAt > story.timeStart);
                    }));
                }

                // Add current story init task count to main task count
                initTasks = initTasks + storyTasks;
            });

            data.tasksOver = _.sortBy(tasksOver, function(task) { return task.createdAt; } );
            data.initTasks = initTasks;
            data.chartData = [];

            // Add 'Ideal task remaining' data
            data.chartData.push({
                name: "Ideal tasks remaining",
                nameShort: "Ideal",
                type: "spline",
                color: "#3276b1",
                dashStyle: "dash",
                marker: {
                    enabled: false,
                    radius: 3
                },
                lineWidth: 1,
                data: getIdealData()
            });

            // Add 'Actual task remaining' data
            data.chartData.push({
                name: "Actual tasks remaining",
                nameShort: "Actual",
                type: "spline",
                color: "#c9302c",
                shadow: true,
                marker: {
                    enabled: false,
                    radius: 3
                },
                data: getActualData()
            });

            // Add 'Added tasks' data
            data.chartData.push({
                name: "Added tasks",
                nameShort: "Added",
                type: "column",
                color: "#ec971f",
                data: getAddedData()
            });

            res.json(data);
        }

        /**
         * Private function to determine ideal data for charts. This is basically linear line where
         * start point is at sprint start and value for that point is sprint initial task count. End
         * point is at sprint end and value is zero.
         *
         * Output is an array of UTC date times and actual values.
         *
         * @returns {Array}
         */
        function getIdealData() {
            var output = [];
            var tasks = data.initTasks;
            var startTime = data.sprint.dateStartObject();
            var endTime = data.sprint.dateEndObject();
            var tasksPerDay = data.initTasks / (data.sprint.durationDays() - 1);

            for (var i = 0; i < (data.sprint.durationDays() - 1); i++) {
                var date = startTime.add("days", i === 0 ? 0 : 1);

                output.push([Date.UTC(date.year(), date.month(), date.date()), (tasks - i * tasksPerDay)]);
            }

            output.push([Date.UTC(endTime.year(), endTime.month(), endTime.date()), 0]);

            return output;
        }

        /**
         * Private function to get actual task data.
         *
         * @returns {Array}
         */
        function getActualData() {
            var output = [];
            var tasks = data.initTasks;
            var startTime = data.sprint.dateStartObject();
            var endTime = data.sprint.dateEndObject();
            var tasksDone = 0;
            var tasksOver = 0;

            // Add first point of data
            output.push([Date.UTC(startTime.year(), startTime.month(), startTime.date()), tasks]);

            var currentDate = startTime.add("days", 1);

            // Loops days
            while (endTime.diff(currentDate, "days") >= 0) {
                // Get reference date, this is used to determine actual tasks that are done or added
                var referenceDate = currentDate.clone().subtract("days", 1);

                // We are only interested days that are before current day
                if (referenceDate.isBefore(moment().add("days", 1), "day")) {
                    // Calculate done task count
                    tasksDone = _.size(_.filter(data.tasks, function(task) {
                        return task.isDone && task.timeEndObject().isSame(referenceDate, "day");
                    }));

                    // Calculate added task count
                    tasksOver = _.size(_.filter(data.tasksOver, function(task) {
                        return task.createdAtObject().isSame(referenceDate, "day");
                    }));

                    // Calculate new task count based to previous tasks, done and added tasks count
                    tasks = tasks - tasksDone + tasksOver;

                    output.push([Date.UTC(currentDate.year(), currentDate.month(), currentDate.date()), tasks]);
                }

                // Go to next date
                currentDate.add("days", 1);
            }

            return output;
        }

        /**
         * Private function to get possible added task data for current sprint.
         *
         * @returns {Array}
         */
        function getAddedData() {
            var output = [];

            _.each(_.groupBy(data.tasksOver, function(task) { return task.createdAtObject().format("YYYY-MM-DD"); }),
                function(tasks) {
                    var date = tasks[0].createdAtObject();

                    output.push([Date.UTC(date.year(), date.month(), date.date()), _.size(tasks)]);
                }
            );

            return output;
        }
    }
};
