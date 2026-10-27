require "cgi"

module RezabBlog
  module TextFilters
    def decode_entities(value)
      CGI.unescapeHTML(value.to_s)
    end
  end
end

Liquid::Template.register_filter(RezabBlog::TextFilters)
