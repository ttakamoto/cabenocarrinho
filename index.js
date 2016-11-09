var express = require('express');
var app = express();
var pg = require('pg');
var async = require('async');
var uuid = require('uuid');
var path = require("path");
var bodyParser = require("body-parser");

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

app.get('/', function(request, response) {
  response.status(200).json("cabenocarrinho API");
});

app.get('/products', function (request, response) {
	pg.connect(process.env.DATABASE_URL, function(err, client, done) {
		client.query('SELECT * FROM products', function(err, result) {
      		done();
	      	if (err) {
	      		console.error(err);
	      		response.send("Error " + err);
	      	}
	       	else {
	       		response.status(200).json(result.rows);
	       	}
    	});
  	});
});

app.get('/products/:id', function (request, response) {
	var product_id = request.params.id;
	if (product_id == null) {
		handleError(response, 'product invalid', 'product_id param is missing', 500);
	} else {
		pg.connect(process.env.DATABASE_URL, function(err, client, done) {
			client.query('SELECT * FROM products where id=$1',[product_id], function(err, result) {
	      		done();
		      	if (err) {
		      		console.error(err);
		      		response.send("Error " + err);
		      	}
		       	else {
		       		response.status(200).json(result.rows[0]);
		       	}
	    	});
	  	});
	}
});

app.get('/subscriptions', function (request, response) {
	pg.connect(process.env.DATABASE_URL, function(err, client, done) {
		client.query('select * from subscriptions', function(err, result) {
      		done();
	      	if (err) {
	      		console.error(err);
      			response.send("Error " + err);
	      	}
	       	else {
	       		response.status(200).json(result.rows);
	       	}
    	});
  	});
});

app.post('/subscriptions', function (request, response) {
	var param = request.body;
	if (request.body == null || request.body.email == null) {
		handleError(response, 'param email invalid', 'send email as request param', 500);
	} else {
		var email = param.email;

		pg.connect(process.env.DATABASE_URL, function(err, client, done) {
			client.query('insert into subscriptions (id,email) values ($1,$2) returning id',
				[uuid.v4(), email],
				function(err, result) {
		      		done();
			      	if (err) {
			      		console.error(err);
		      			response.send("Error " + err);
			      	}
			       	else {
			       		response.status(200).json('row inserted with id: ' + result.rows[0].id);
			       	}
	    	});
	  	});
	}
});

app.get('/orders', function (request, response) {
	pg.connect(process.env.DATABASE_URL, function(err, client, done) {
		client.query('SELECT * FROM orders order by reward desc ', function(err, result) {
      		done();
	      	if (err) {
	      		console.error(err);
	      		response.send("Error " + err);
	      	}
	       	else {
						// getting items
	       		client.query('SELECT * from items', function(err,result2) {
	   					result.rows.forEach(function(order) {
	   						order.items = [];
	   						result2.rows.forEach(function(item) {
	   							if (item.order_id == order.id) {
	   								order.items.push(item);
	   							}
	   						});
	   					});
							// getting products
							client.query('SELECT * from products', function(err,result_prod) {
		   					result.rows.forEach(function(order) {
										order.items.forEach(function(item) {
											result_prod.rows.forEach(function(product) {
												if (item.product_id == product.id) {
													item.product = product;
												}
											});
										});
		   					});
								response.status(200).json(result.rows);
	       			});
       			});
	       	}
    	});
  	});
});

app.post('/orders', function (request, response) {
	var order = request.body;
	if (order == null || order.items == null) {
		handleError(response, 'order invalid', 'order param is missing', 500);
	} else {
		pg.connect(process.env.DATABASE_URL, function(err, client, done) {
			client.query('INSERT INTO orders (id, name, address, reward, status, due_date) ' +
				' values ($1,$2,$3,$4,$5,$6) returning id',
					[uuid.v4(),
					order.name,
					order.address,
					order.reward,
					order.status,
					order.due_date],
				function(err, result_order) {
		      		done();
			      	if (err) {
			      		console.error(err);
			      		response.send("Error " + err);
			      	}
			       	else {
			       		var order_id = result_order.rows[0].id;
			       		console.log('order inserido: ' + order_id);
			       		if (order.items != null && order.items.length > 0) {
			       			var values = [];
			       			order.items.forEach(function(item) {
			       				values.push({
			       					'order_id' : order_id,
			       					'product_id' : item.product_id,
			       					'quantity' : item.quantity
			       				});
			       			});
			       			console.log(values);
			       			async.each(values,insertItem,function(err) {
							    // Release the client to the pg module
								done();
								if (err) {
									console.log(err);
								    response.status(500).json("Error running query to items creation");
								} else {
									response.status(200).json("Items created");
								}
							});
			       		} else {
			       			response.status(200).json("No items were inserted for this order");
			       		}
			       	}
		    	});
	  	});
	}
});

function insertItem(item,callback) {
	pg.connect(process.env.DATABASE_URL, function(err, client, done) {
	  	client.query('INSERT INTO items (order_id,product_id,quantity) values ($1,$2,$3)',
		  	[
		    	item.order_id,
		        item.product_id,
		        item.quantity
		    ],
		  	function(err,result) {
		    	// return any err to async.each iterator
		    	callback(err);
		  	});
	});
}

app.put('/orders/:id', function (request, response) {
	var order_id = request.params.id;
	var order = request.body;
	if (order_id == null || order == null) {
		handleError(response, 'order invalid', 'order param is missing', 500);
	} else {
		pg.connect(process.env.DATABASE_URL, function(err, client, done) {
			client.query('UPDATE orders SET name=$2, address=$3, reward=$4, status=$5, due_date=$6 ' +
					' WHERE id=$1',
					[order_id,
					order.name,
					order.address,
					order.reward,
					order.status,
					order.due_date],
				function(err, result_order) {
		      		done();
			      	if (err) {
			      		console.error(err);
			      		response.send("Error " + err);
			      	}
			       	else {
			       		response.status(200).json("order updated successfully");
			       	}
		    	});
	  	});
	}
});

app.delete('/orders/:id', function (request, response) {
	var order_id = request.params.id;
	if (order_id == null) {
		handleError(response, 'order invalid', 'order_id param is missing', 500);
	} else {
		pg.connect(process.env.DATABASE_URL, function(err, client, done) {
			client.query('DELETE FROM items WHERE order_id=$1',
					[order_id],
				function(err, result_items) {
		      		done();
			      	if (err) {
			      		console.error(err);
			      		response.send("Error " + err);
			      	}
			       	else {
			       		client.query('DELETE FROM orders WHERE id=$1',
							[order_id],
							function(err, result_orders) {
					      		done();
						      	if (err) {
						      		console.error(err);
						      		response.send("Error " + err);
						      	}
						       	else {
						       		response.status(200).json("order deleted successfully");
						       	}
				    		});
			       	}
		    	});
	  	});
	}
});
