from google.appengine.api import users
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app
from google.appengine.ext import db
from google.appengine.ext.webapp import template
from google.appengine.api import mail

# Todo defines the data model for the Customer service
# as it extends db.model the content of the class will automatically stored
class TodoModel(db.Model):
  author 	   = db.UserProperty(required=True)
  shortDescription = db.StringProperty(required=True)
  compliantDescription  = db.StringProperty(multiline=True)
  longDescription  = db.StringProperty(multiline=True)
  phone	 	   = db.StringProperty()
  created          = db.DateTimeProperty(auto_now_add=True)
  updated 	   = db.DateTimeProperty(auto_now=True)
  dueDate          = db.StringProperty(required=True)
  finished         = db.BooleanProperty()


# The main page where the user can login and logout
# MainPage is a subclass of webapp.RequestHandler and overwrites the get method
class MainPage(webapp.RequestHandler):
    def get(self):
        user = users.get_current_user()
        url = users.create_login_url(self.request.uri)
        url_linktext = 'Login'
                    
        if user:
            url = users.create_logout_url(self.request.uri)
            url_linktext = 'Logout'
# GQL is similar to SQL             
        todos = TodoModel.gql("WHERE author = :author and finished=false",
               author=users.get_current_user())
        
        values = {
            'todos': todos,
	    'numbertodos' : todos.count(),
            'user': user,
            'url': url,
            'url_linktext': url_linktext,
        }
        self.response.out.write(template.render('index.html', values))



# This class creates a new customers item
class New(webapp.RequestHandler):
    def post(self):
        user = users.get_current_user()
        if user:
	    testphone = self.request.get('phone')
	    if not testphone.startswith("+91-") and testphone:
		testphone = "+91-"+ testphone
            todo = TodoModel(
                author  = users.get_current_user(),
                shortDescription = self.request.get('shortDescription'),
		compliantDescription = self.request.get('compliantDescription'),
                longDescription = self.request.get('longDescription'),
		dueDate = self.request.get('dueDate'),
                phone = testphone,
		finished = False)
            todo.put();
                
            self.redirect('/')           

# This class deletes the selected customers finished work
class Done(webapp.RequestHandler):
    def get(self):
        user = users.get_current_user()
        if user:
            raw_id = self.request.get('id')
            id = int(raw_id)
            todo = TodoModel.get_by_id(id)
            todo.delete()
            self.redirect('/')



# Register the URL with the responsible classes
application = webapp.WSGIApplication(
                                     [('/', MainPage),
                                      ('/new', New),
				      ('/done', Done),],
                                     debug=False)

# Register the wsgi application to run
def main():
  run_wsgi_app(application)

if __name__ == "__main__":
  main()
			
