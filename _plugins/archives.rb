# Category and tag archives are derived from Markdown front matter at build time.
module RezabBlog
  class Archives < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      { "category" => site.categories, "tag" => site.tags }.each do |kind, groups|
        groups.each do |name, posts|
          slug = Jekyll::Utils.slugify(name)
          page = Jekyll::PageWithoutAFile.new(site, site.source, "#{kind}/#{slug}", "index.html")
          page.content = ""
          page.data = {
            "layout" => "archive",
            "title" => "#{kind.capitalize}: #{name}",
            "posts" => posts.sort_by(&:date).reverse
          }
          site.pages << page
        end
      end
    end
  end
end
